/**
 * Dialog handler for ISSUE_00004.
 *
 * Replaces the placeholder hard-block with a 4-option ctx.ui.select() dialog.
 * Falls back to hard-block when ctx.hasUI is false (print / non-interactive mode).
 *
 * The session-level allowlist Map is threaded in as a parameter so this module
 * stays pure and testable; the real Map lives in index.ts.
 */

import { analyzeCommand } from './src/core/analyze.js';
import { buildAnalysisOptions } from './hook.js';
import {
  allowKey,
  commandToAllowKey,
  saveAllowEntry,
  defaultGlobalPath,
} from './src/allowlist.js';
import type { AllowEntry } from './src/allowlist.js';
import type { ToolCallEvent, ToolCallEventResult, ExtensionContext } from '@mariozechner/pi-coding-agent';

// ---------------------------------------------------------------------------
// Dialog choice labels — exported so tests can reference them without strings
// ---------------------------------------------------------------------------

export const DIALOG_CHOICES = {
  DENY: 'Deny',
  ALLOW_ONCE: 'Allow Once',
  ALLOW_SESSION: 'Allow for Session',
  ALLOW_REMEMBER: 'Allow and Remember',
} as const;

// Session-allow key: "<command>/<subcommand>" e.g. "git/push"
// Uses the blocked segment from analysis (available after analyzeCommand returns).
function sessionKey(command: string, segment: string): string {
  // Extract the base command and first non-option arg from the segment
  const parts = segment.trim().split(/\s+/);
  const cmd = parts[0] ?? command.trim().split(/\s+/)[0] ?? command;
  const sub = parts[1]?.startsWith('-') ? '-' : (parts[1] ?? '-');
  return `${cmd}/${sub}`;
}

// ---------------------------------------------------------------------------
// Core dialog handler
// ---------------------------------------------------------------------------

export async function handleToolCallWithDialog(
  event: ToolCallEvent,
  ctx: Pick<ExtensionContext, 'hasUI' | 'cwd' | 'ui'>,
  sessionMap: Map<string, true>,
  allowlistCache: AllowEntry[] = [],
  globalAllowlistFile: string = defaultGlobalPath(),
): Promise<ToolCallEventResult | undefined> {
  if (event.toolName !== 'bash') return undefined;

  const command = (event.input as { command: string }).command;

  // Persistent allowlist bypass: checked BEFORE analysis (fast key lookup, no parser).
  const preKey = commandToAllowKey(command);
  const inAllowlist = allowlistCache.some((e) => allowKey(e) === preKey);
  if (inAllowlist) return undefined;

  // Session-level bypass (also checked before analysis).
  if (sessionMap.has(preKey)) return undefined;

  const options = buildAnalysisOptions(ctx.cwd);

  const result = analyzeCommand(command, options);
  if (result === null) return undefined;

  // Derive segment-based key for session tracking after analysis.
  const key = sessionKey(command, result.segment);
  if (sessionMap.has(key)) return undefined;

  // Fall back to hard block in non-interactive mode
  if (!ctx.hasUI) {
    return { block: true, reason: result.reason };
  }

  // Build dialog body
  const body = [
    `Reason: ${result.reason}`,
    `Command: ${command}`,
    ...(result.segment && result.segment !== command
      ? [`Segment: ${result.segment}`]
      : []),
  ].join('\n');

  const choices = [
    DIALOG_CHOICES.DENY,
    DIALOG_CHOICES.ALLOW_ONCE,
    DIALOG_CHOICES.ALLOW_SESSION,
    DIALOG_CHOICES.ALLOW_REMEMBER,
  ];

  const title = `⚠️ Dangerous Command Detected\n${body}`;
  const choice = await ctx.ui.select(title, choices);

  switch (choice) {
    case DIALOG_CHOICES.ALLOW_ONCE:
      return undefined;

    case DIALOG_CHOICES.ALLOW_SESSION: {
      const key = sessionKey(command, result.segment);
      sessionMap.set(key, true);
      return undefined;
    }

    case DIALOG_CHOICES.ALLOW_REMEMBER: {
      // Parse command + subcommand from blocked segment for the stored entry.
      // Use the same second-token rule as commandToAllowKey / sessionKey for
      // consistency: if the second token is a flag, subcommand is omitted.
      const segParts = result.segment.trim().split(/\s+/);
      const entryCmd = segParts[0] ?? command.trim().split(/\s+/)[0] ?? command;
      const rawSub = segParts[1];
      const entrySub = rawSub === undefined || rawSub.startsWith('-') ? undefined : rawSub;
      const entry: AllowEntry = { command: entryCmd, subcommand: entrySub };

      // Persist to global allowlist file.
      saveAllowEntry(entry, 'global', ctx.cwd, globalAllowlistFile);

      // Also populate the in-session cache so subsequent calls in this session
      // are silently allowed without re-reading the file.
      allowlistCache.push(entry);
      sessionMap.set(allowKey(entry), true);
      return undefined;
    }

    case DIALOG_CHOICES.DENY:
    default:
      // Cancelled (undefined) or Deny — block
      return { block: true, reason: result.reason };
  }
}

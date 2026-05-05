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
import { writeAuditLog, redactSecrets } from './src/core/audit.js';
import { buildAnalysisOptions } from './hook.js';
import type { Config } from './src/types.js';
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
  cachedConfig?: Config,
  sessionId?: string,
): Promise<ToolCallEventResult | undefined> {
  if (event.toolName !== 'bash') return undefined;

  const command = (event.input as { command: string }).command;
  const options = buildAnalysisOptions(ctx.cwd);

  // Use cached config from session_start if available; otherwise analyzeCommand
  // will call loadConfig itself.
  const result = analyzeCommand(command, { ...options, config: cachedConfig });
  if (result === null) return undefined;

  // Write audit log entry immediately when a dangerous command is detected,
  // before showing the dialog (regardless of whether the user allows it).
  const effectiveSessionId = sessionId ?? `fallback-${Date.now()}`;
  writeAuditLog(
    effectiveSessionId,
    command,
    result.segment,
    result.reason,
    ctx.cwd ?? null,
  );

  // Session-level bypass: if this pattern was already allowed this session, skip dialog.
  const key = sessionKey(command, result.segment);
  if (sessionMap.has(key)) return undefined;

  // Fall back to hard block in non-interactive mode
  if (!ctx.hasUI) {
    return { block: true, reason: result.reason };
  }

  // Redact secrets from the command before displaying in the dialog.
  const safeCommand = redactSecrets(command);
  const safeSegment = redactSecrets(result.segment);

  // Build dialog body with redacted command
  const body = [
    `Reason: ${result.reason}`,
    `Command: ${safeCommand}`,
    ...(safeSegment && safeSegment !== safeCommand
      ? [`Segment: ${safeSegment}`]
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

    case DIALOG_CHOICES.ALLOW_REMEMBER:
      // Stub: persistent allowlist write is implemented in Wave 3
      return undefined;

    case DIALOG_CHOICES.DENY:
    default:
      // Cancelled (undefined) or Deny — block
      return { block: true, reason: result.reason };
  }
}

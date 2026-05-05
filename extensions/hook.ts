/**
 * Tool-call hook: intercepts bash commands and analyzes them for dangerous patterns.
 *
 * Exported as named functions so they can be tested without a live pi runtime.
 */

import { analyzeCommand } from './src/core/analyze.js';
import type { AnalyzeOptions } from './src/types.js';
import type { ToolCallEvent, ToolCallEventResult } from '@mariozechner/pi-coding-agent';

// ---------------------------------------------------------------------------
// Options builder — reads env vars at call time so tests can set them freely
// ---------------------------------------------------------------------------

export function buildAnalysisOptions(cwd: string): AnalyzeOptions {
  const worktreeMode = process.env['SAFETY_NET_WORKTREE'] !== '0';
  const strict = process.env['SAFETY_NET_STRICT'] === '1';
  const paranoid = process.env['SAFETY_NET_PARANOID'] === '1';
  const paranoidRm =
    paranoid || process.env['SAFETY_NET_PARANOID_RM'] === '1';
  const paranoidInterpreters =
    paranoid || process.env['SAFETY_NET_PARANOID_INTERPRETERS'] === '1';

  return { cwd, worktreeMode, strict, paranoidRm, paranoidInterpreters };
}

// ---------------------------------------------------------------------------
// Core handler — returns ToolCallEventResult | undefined
// Placeholder: returns hard block. ISSUE_00004 replaces this with the dialog.
// ---------------------------------------------------------------------------

export async function handleToolCall(
  event: ToolCallEvent,
  cwd: string,
): Promise<ToolCallEventResult | undefined> {
  if (event.toolName !== 'bash') return undefined;

  // event.toolName === 'bash' narrows input to BashToolInput
  const command = (event.input as { command: string }).command;
  const options = buildAnalysisOptions(cwd);
  const result = analyzeCommand(command, options);

  if (result === null) return undefined;

  // Placeholder: hard block — replaced by dialog in ISSUE_00004
  return { block: true, reason: result.reason };
}

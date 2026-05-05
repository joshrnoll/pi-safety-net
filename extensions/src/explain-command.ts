/**
 * /safety-net:explain command implementation (ISSUE_00013).
 *
 * Provides:
 *  - `runExplain(cmdString, cwd)` — pure function returning a formatted report string.
 *    Testable without a pi runtime.
 *  - `formatModeFlags()` — pure function returning a human-readable list of active mode flags.
 *  - `handleExplainCommand(args, ctx)` — pi command handler that delegates to runExplain
 *    and delivers output via ctx.ui.notify() (interactive) or stdout (non-interactive).
 */

import { analyzeCommand } from '../src/core/analyze.js';
import { buildAnalysisOptions } from '../hook.js';

// ---------------------------------------------------------------------------
// Mode flag formatter
// ---------------------------------------------------------------------------

/**
 * Build a human-readable summary of active mode flags, read from env vars.
 * Always includes worktree mode (since it defaults to ON).
 */
export function formatModeFlags(): string {
  const worktree = process.env['SAFETY_NET_WORKTREE'] !== '0';
  const strict = process.env['SAFETY_NET_STRICT'] === '1';
  const paranoid = process.env['SAFETY_NET_PARANOID'] === '1';
  const paranoidRm = paranoid || process.env['SAFETY_NET_PARANOID_RM'] === '1';
  const paranoidInterpreters = paranoid || process.env['SAFETY_NET_PARANOID_INTERPRETERS'] === '1';

  const lines: string[] = ['Active modes:'];
  lines.push(`  worktree mode: ${worktree ? 'ON ✓' : 'OFF ✗'}`);
  if (strict) lines.push('  strict: ON 🔒');
  if (paranoid) lines.push('  paranoid: ON 👁️ (implies paranoid-rm + paranoid-interpreters)');
  else {
    if (paranoidRm) lines.push('  paranoid-rm: ON 🗑️');
    if (paranoidInterpreters) lines.push('  paranoid-interpreters: ON 🐚');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core explain function (pure — no pi runtime dependency)
// ---------------------------------------------------------------------------

/**
 * Run analyzeCommand on cmdString with current env-based options and return
 * a formatted, human-readable report.
 *
 * @param cmdString  The raw command string to analyse (may be empty).
 * @param cwd        Directory to use as the working directory for analysis.
 * @returns          Multi-line report string.
 */
export function runExplain(cmdString: string, cwd: string): string {
  const trimmed = cmdString.trim();
  if (!trimmed) {
    return [
      'Usage: /safety-net:explain <command>',
      '',
      'Provide a command string to analyse. Examples:',
      '  /safety-net:explain "git reset --hard"',
      '  /safety-net:explain "git checkout -b feature"',
      '',
      formatModeFlags(),
    ].join('\n');
  }

  const options = buildAnalysisOptions(cwd);
  const result = analyzeCommand(trimmed, options);

  const lines: string[] = [];

  if (result !== null) {
    lines.push('BLOCKED');
    lines.push(`Reason:  ${result.reason}`);
    if (result.segment && result.segment !== trimmed) {
      lines.push(`Segment: ${result.segment}`);
    }
  } else {
    lines.push('ALLOWED');
  }

  lines.push('');
  lines.push(formatModeFlags());

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Pi command handler
// ---------------------------------------------------------------------------

interface ExplainCtx {
  hasUI: boolean;
  cwd: string;
  ui?: {
    notify: (message: string) => void;
  };
}

/**
 * Handler for the `safety-net:explain` pi slash command.
 *
 * @param args  The argument string after the command name (the command to analyse).
 * @param ctx   The pi ExtensionContext (typed narrowly for testability).
 */
export async function handleExplainCommand(
  args: string | undefined,
  ctx: ExplainCtx,
): Promise<void> {
  const output = runExplain(args ?? '', ctx.cwd);

  if (ctx.hasUI && ctx.ui?.notify) {
    ctx.ui.notify(output);
  } else {
    process.stdout.write(output + '\n');
  }
}

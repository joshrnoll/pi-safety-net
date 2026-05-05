/**
 * Mode-aware status indicator for ISSUE_00006.
 *
 * Reads env vars at call time and builds a footer status string.
 * Called from session_start to set the footer via ctx.ui.setStatus().
 */

export function buildStatusText(): string {
  const strict = process.env['SAFETY_NET_STRICT'] === '1';
  const paranoid = process.env['SAFETY_NET_PARANOID'] === '1';
  const paranoidRm = process.env['SAFETY_NET_PARANOID_RM'] === '1';
  const paranoidInterpreters = process.env['SAFETY_NET_PARANOID_INTERPRETERS'] === '1';
  const worktreeDisabled = process.env['SAFETY_NET_WORKTREE'] === '0';

  const emojis: string[] = [];

  if (strict) emojis.push('🔒');
  if (paranoid) emojis.push('👁️');
  else {
    if (paranoidRm) emojis.push('🗑️');
    if (paranoidInterpreters) emojis.push('🐚');
  }

  // Append ⚠️ when worktree mode is explicitly disabled
  if (worktreeDisabled) emojis.push('⚠️');

  // Default: show ✅ when no special modes are active
  if (emojis.length === 0) emojis.push('✅');

  return `🛡️ Safety Net ${emojis.join('')}`;
}

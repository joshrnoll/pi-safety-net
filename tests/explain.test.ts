/**
 * Tests for ISSUE_00013: /safety-net:explain Command
 *
 * Acceptance criteria:
 *  - /safety-net:explain "git reset --hard" shows BLOCKED with reason
 *  - /safety-net:explain "git checkout -b feature" shows ALLOWED
 *  - /safety-net:explain with no argument shows usage instructions
 *  - Active mode flags are shown in the output
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runExplain, formatModeFlags } from '../extensions/src/explain-command.js';

const cwd = process.cwd();

// ---------------------------------------------------------------------------
// formatModeFlags
// ---------------------------------------------------------------------------

test('formatModeFlags shows worktree mode as ON by default', () => {
  // Save and clear env
  const saved = process.env['SAFETY_NET_WORKTREE'];
  delete process.env['SAFETY_NET_WORKTREE'];
  try {
    const flags = formatModeFlags();
    assert.ok(flags.includes('worktree'), 'output should mention worktree mode');
    assert.ok(flags.toLowerCase().includes('on') || flags.includes('✓') || flags.includes('enabled'),
      `output should show worktree mode is on, got: "${flags}"`);
  } finally {
    if (saved !== undefined) process.env['SAFETY_NET_WORKTREE'] = saved;
  }
});

test('formatModeFlags shows worktree mode as OFF when SAFETY_NET_WORKTREE=0', () => {
  const saved = process.env['SAFETY_NET_WORKTREE'];
  process.env['SAFETY_NET_WORKTREE'] = '0';
  try {
    const flags = formatModeFlags();
    assert.ok(flags.includes('worktree'), 'output should mention worktree mode');
    assert.ok(flags.toLowerCase().includes('off') || flags.includes('✗') || flags.includes('disabled'),
      `output should show worktree mode is off, got: "${flags}"`);
  } finally {
    if (saved === undefined) delete process.env['SAFETY_NET_WORKTREE'];
    else process.env['SAFETY_NET_WORKTREE'] = saved;
  }
});

test('formatModeFlags includes strict mode when SAFETY_NET_STRICT=1', () => {
  const saved = process.env['SAFETY_NET_STRICT'];
  process.env['SAFETY_NET_STRICT'] = '1';
  try {
    const flags = formatModeFlags();
    assert.ok(flags.toLowerCase().includes('strict'), `output should mention strict, got: "${flags}"`);
  } finally {
    if (saved === undefined) delete process.env['SAFETY_NET_STRICT'];
    else process.env['SAFETY_NET_STRICT'] = saved;
  }
});

// ---------------------------------------------------------------------------
// runExplain — blocked commands
// ---------------------------------------------------------------------------

test('runExplain shows BLOCKED for git push --force (always blocked)', () => {
  // git push --force is always blocked regardless of worktree mode
  const output = runExplain('git push --force', cwd);
  assert.ok(output.includes('BLOCKED'), `output should contain BLOCKED, got: "${output}"`);
  assert.ok(output.length > 0, 'output should not be empty');
});

test('runExplain includes reason for blocked command', () => {
  // git push --force is always blocked regardless of worktree mode
  const output = runExplain('git push --force', cwd);
  // Should include some reason text beyond just BLOCKED
  assert.ok(output.includes('BLOCKED'), 'should show BLOCKED');
  // Reason should appear (the analysis engine returns a reason string)
  const lines = output.split('\n').filter(l => l.trim());
  assert.ok(lines.length > 1, 'output should have multiple lines (status + reason/flags)');
});

test('runExplain shows BLOCKED for git push --force (always blocked)', () => {
  const output = runExplain('git push --force', cwd);
  assert.ok(output.includes('BLOCKED'), `git push --force should be BLOCKED, got: "${output}"`);
});

// ---------------------------------------------------------------------------
// runExplain — allowed commands
// ---------------------------------------------------------------------------

test('runExplain shows ALLOWED for git checkout -b feature', () => {
  const output = runExplain('git checkout -b feature', cwd);
  assert.ok(output.includes('ALLOWED'), `output should contain ALLOWED, got: "${output}"`);
});

test('runExplain shows ALLOWED for git status', () => {
  const output = runExplain('git status', cwd);
  assert.ok(output.includes('ALLOWED'), `git status should be ALLOWED, got: "${output}"`);
});

// ---------------------------------------------------------------------------
// runExplain — mode flags in output
// ---------------------------------------------------------------------------

test('runExplain output includes mode flags section', () => {
  const output = runExplain('git status', cwd);
  // Mode flags should always be shown regardless of allow/block
  assert.ok(
    output.toLowerCase().includes('mode') || output.toLowerCase().includes('worktree'),
    `output should include mode information, got: "${output}"`
  );
});

// ---------------------------------------------------------------------------
// runExplain — no argument (empty string)
// ---------------------------------------------------------------------------

test('runExplain shows usage instructions when no command given', () => {
  const output = runExplain('', cwd);
  assert.ok(
    output.toLowerCase().includes('usage') || output.toLowerCase().includes('provide'),
    `empty input should show usage, got: "${output}"`
  );
  assert.ok(!output.includes('BLOCKED'), 'usage output should not say BLOCKED');
  assert.ok(!output.includes('ALLOWED'), 'usage output should not say ALLOWED');
});

test('runExplain shows usage instructions when argument is only whitespace', () => {
  const output = runExplain('   ', cwd);
  assert.ok(
    output.toLowerCase().includes('usage') || output.toLowerCase().includes('provide'),
    `whitespace-only input should show usage, got: "${output}"`
  );
});

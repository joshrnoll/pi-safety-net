/**
 * Tests for the vendored analyzeCommand engine.
 *
 * Acceptance criteria from ISSUE_00002:
 *  - analyzeCommand import resolves correctly from extensions/src/core/analyze
 *  - analyzeCommand('git reset --hard', { worktreeMode: false }) returns non-null (blocked)
 *  - analyzeCommand('git reset --hard', { default worktreeMode }) returns null inside a worktree
 *    (worktree mode explicitly allows git discard commands inside linked worktrees — PRD §5)
 *  - analyzeCommand('git checkout -b feature', { cwd }) returns null (allowed)
 *  - git push --force is always blocked even in worktree mode
 *  - git stash clear is always blocked even in worktree mode
 *  - rm -rf / is always blocked
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCommand } from '../extensions/src/core/analyze.js';

const cwd = process.cwd();

test('import resolves: analyzeCommand is a function', () => {
  assert.equal(typeof analyzeCommand, 'function');
});

test('git reset --hard is blocked when worktreeMode is explicitly off', () => {
  // Without worktree mode, git reset --hard is always blocked.
  const result = analyzeCommand('git reset --hard', { cwd, worktreeMode: false });
  assert.notEqual(result, null, 'git reset --hard should be blocked when worktreeMode=false');
  assert.ok(result?.reason, 'blocked result should have a reason');
});

test('git reset --hard is allowed inside a worktree (worktreeMode default=true)', () => {
  // With worktree mode on (default), git discard commands are allowed inside linked worktrees.
  // PRD §5: "git reset --hard, git restore, git checkout --, and git clean -f to be allowed
  // by default inside linked worktrees".
  // The test runs from a real worktree so this should return null.
  const result = analyzeCommand('git reset --hard', { cwd });
  assert.equal(
    result,
    null,
    'git reset --hard should be allowed in a linked worktree with default worktreeMode=true',
  );
});

test('git checkout -b feature is allowed', () => {
  const result = analyzeCommand('git checkout -b feature', { cwd });
  assert.equal(result, null, 'git checkout -b feature should be allowed (branch creation)');
});

test('git push --force is always blocked even in worktree mode', () => {
  const result = analyzeCommand('git push --force', { cwd });
  assert.notEqual(result, null, 'git push --force should always be blocked');
  assert.ok(result?.reason?.includes('force'), 'reason should mention force push');
});

test('git stash clear is always blocked even in worktree mode', () => {
  const result = analyzeCommand('git stash clear', { cwd });
  assert.notEqual(result, null, 'git stash clear should always be blocked');
});

test('rm -rf / is always blocked', () => {
  const result = analyzeCommand('rm -rf /', { cwd });
  assert.notEqual(result, null, 'rm -rf / should always be blocked (root deletion)');
});

test('worktree mode is ON by default (SAFETY_NET_WORKTREE not set to 0)', () => {
  // Validate the environment default — this test will fail if someone sets
  // SAFETY_NET_WORKTREE=0 in the test environment, which is the intended signal to disable it.
  assert.notEqual(
    process.env['SAFETY_NET_WORKTREE'],
    '0',
    'SAFETY_NET_WORKTREE=0 would disable worktree mode — not set in this test run',
  );
});

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
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  //
  // We must pass a path that git detects as a linked worktree (not the main repo dir).
  // Check for any available linked worktree; skip if none exist.
  let worktreeCwd: string | null = null;
  try {
    const lines = execSync('git worktree list --porcelain', { cwd }).toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const p = line.slice('worktree '.length).trim();
        // Skip the main worktree (it reports common == dir, not a linked worktree)
        const common = execSync('git rev-parse --git-common-dir', { cwd: p }).toString().trim();
        const gitDir = execSync('git rev-parse --git-dir', { cwd: p }).toString().trim();
        if (common !== gitDir && existsSync(p)) {
          worktreeCwd = p;
          break;
        }
      }
    }
  } catch { /* ignore */ }

  if (worktreeCwd === null) {
    // No linked worktrees available — skip
    console.log('SKIP: no linked worktree available for worktree-mode test');
    return;
  }

  const result = analyzeCommand('git reset --hard', { cwd: worktreeCwd });
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

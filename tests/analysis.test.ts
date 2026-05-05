/**
 * Analysis engine integration tests (ISSUE_00014).
 *
 * Verifies block/allow outcomes for each major rule category using pi-specific
 * defaults (worktree mode ON by default). Complements the upstream cc-safety-net
 * test suite with pi-specific behavioural contracts.
 *
 * Acceptance criteria:
 *  - At least one blocked and one allowed case per category
 *  - Worktree-on-by-default is explicitly tested and confirmed
 *  - /safety-net:explain output verified for blocked and allowed commands
 *  - All tests pass with node --test
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeCommand } from '../extensions/src/core/analyze.js';
import { runExplain } from '../extensions/src/explain-command.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a temp directory for use as a cwd that is NOT a git worktree. */
function makeTmpCwd(name: string): string {
  const dir = join(tmpdir(), `pi-safety-net-analysis-test-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// A non-worktree cwd for tests that need to distinguish in/out-of-worktree.
// We create a fresh temp dir; git won't recognise it as a worktree.
const tmpCwd = makeTmpCwd('main');

// Discover a linked worktree to use for worktree-mode tests.
// Returns null if no linked worktrees are available (tests that use this will skip).
function findLinkedWorktree(): string | null {
  try {
    const lines = execSync('git worktree list --porcelain', { cwd: process.cwd() }).toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const p = line.slice('worktree '.length).trim();
        const common = execSync('git rev-parse --git-common-dir', { cwd: p }).toString().trim();
        const gitDir = execSync('git rev-parse --git-dir', { cwd: p }).toString().trim();
        // A linked worktree has a different --git-dir from --git-common-dir
        if (common !== gitDir && existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

const worktreeCwd = findLinkedWorktree();

// ---------------------------------------------------------------------------
// Worktree mode: default ON
// ---------------------------------------------------------------------------

test('worktree mode is ON by default (SAFETY_NET_WORKTREE not 0)', () => {
  assert.notEqual(process.env['SAFETY_NET_WORKTREE'], '0',
    'SAFETY_NET_WORKTREE=0 would disable worktree mode — must not be set in this run');
});

// ---------------------------------------------------------------------------
// Category: Git local discard commands
// (allowed in worktrees, blocked without worktree mode)
// ---------------------------------------------------------------------------

test('git local discard: git reset --hard is BLOCKED when worktreeMode=false', () => {
  const result = analyzeCommand('git reset --hard', { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(result, null, 'git reset --hard should be blocked when worktreeMode=false');
  assert.ok(result?.reason, 'blocked result should carry a reason');
});

test('git local discard: git reset --hard is ALLOWED inside a linked worktree (default mode)', () => {
  if (!worktreeCwd) {
    console.log('SKIP: no linked worktree available');
    return;
  }
  const result = analyzeCommand('git reset --hard', { cwd: worktreeCwd });
  assert.equal(result, null,
    'git reset --hard should be allowed in a linked worktree with default worktreeMode=true');
});

test('git local discard: git checkout -- . is BLOCKED when worktreeMode=false', () => {
  const result = analyzeCommand('git checkout -- .', { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(result, null, 'git checkout -- should be blocked when worktreeMode=false');
});

test('git local discard: git checkout -- . is ALLOWED in a linked worktree (default mode)', () => {
  if (!worktreeCwd) { console.log('SKIP: no linked worktree available'); return; }
  const result = analyzeCommand('git checkout -- .', { cwd: worktreeCwd });
  assert.equal(result, null, 'git checkout -- should be allowed in a linked worktree');
});

test('git local discard: git restore . is BLOCKED when worktreeMode=false', () => {
  const result = analyzeCommand('git restore .', { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(result, null, 'git restore should be blocked when worktreeMode=false');
});

test('git local discard: git restore . is ALLOWED in a linked worktree (default mode)', () => {
  if (!worktreeCwd) { console.log('SKIP: no linked worktree available'); return; }
  const result = analyzeCommand('git restore .', { cwd: worktreeCwd });
  assert.equal(result, null, 'git restore should be allowed in a linked worktree');
});

test('git local discard: git clean -f is BLOCKED when worktreeMode=false', () => {
  const result = analyzeCommand('git clean -f', { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(result, null, 'git clean -f should be blocked when worktreeMode=false');
});

test('git local discard: git clean -f is ALLOWED in a linked worktree (default mode)', () => {
  if (!worktreeCwd) { console.log('SKIP: no linked worktree available'); return; }
  const result = analyzeCommand('git clean -f', { cwd: worktreeCwd });
  assert.equal(result, null, 'git clean -f should be allowed in a linked worktree');
});

// ---------------------------------------------------------------------------
// Category: Git shared state (always blocked regardless of worktree mode)
// ---------------------------------------------------------------------------

test('git shared state: git push --force is ALWAYS BLOCKED (even in worktree)', () => {
  const resultInWorktree = analyzeCommand('git push --force', { cwd: worktreeCwd });
  assert.notEqual(resultInWorktree, null, 'git push --force blocked in worktree cwd');

  const resultNoWorktree = analyzeCommand('git push --force', { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(resultNoWorktree, null, 'git push --force blocked without worktree mode');
});

test('git shared state: git push --force-with-lease is ALLOWED (not a hard force)', () => {
  // --force-with-lease has a safety check built in; the engine only blocks --force
  const result = analyzeCommand('git push --force-with-lease', { cwd: tmpCwd });
  assert.equal(result, null, 'git push --force-with-lease is not blocked (uses safe force variant)');
});

test('git shared state: git branch -D mybranch is BLOCKED', () => {
  const result = analyzeCommand('git branch -D mybranch', { cwd: tmpCwd });
  assert.notEqual(result, null, 'git branch -D should be blocked (deletes branch)');
});

test('git shared state: git stash clear is ALWAYS BLOCKED', () => {
  const result = analyzeCommand('git stash clear', { cwd: worktreeCwd });
  assert.notEqual(result, null, 'git stash clear should always be blocked');
});

test('git shared state: git stash drop is BLOCKED', () => {
  const result = analyzeCommand('git stash drop', { cwd: tmpCwd });
  assert.notEqual(result, null, 'git stash drop should be blocked');
});

test('git allowed: git checkout -b new-branch is ALLOWED', () => {
  const result = analyzeCommand('git checkout -b new-branch', { cwd: tmpCwd });
  assert.equal(result, null, 'git checkout -b should be allowed (branch creation)');
});

test('git allowed: git status is ALLOWED', () => {
  const result = analyzeCommand('git status', { cwd: tmpCwd });
  assert.equal(result, null, 'git status should be allowed');
});

test('git allowed: git log --oneline is ALLOWED', () => {
  const result = analyzeCommand('git log --oneline', { cwd: tmpCwd });
  assert.equal(result, null, 'git log should be allowed');
});

// ---------------------------------------------------------------------------
// Category: rm patterns
// ---------------------------------------------------------------------------

test('rm: rm -rf targeting / is BLOCKED', () => {
  const result = analyzeCommand('rm -rf /', { cwd: tmpCwd });
  assert.notEqual(result, null, 'rm -rf / should always be blocked');
});

test('rm: rm -rf targeting ~ is BLOCKED', () => {
  const result = analyzeCommand('rm -rf ~', { cwd: tmpCwd });
  assert.notEqual(result, null, 'rm -rf ~ should always be blocked');
});

test('rm: rm -rf targeting $HOME is BLOCKED', () => {
  const result = analyzeCommand('rm -rf $HOME', { cwd: tmpCwd });
  assert.notEqual(result, null, 'rm -rf $HOME should always be blocked');
});

test('rm: rm -rf outside cwd is BLOCKED', () => {
  // Use a clearly separate path (/etc is outside any cwd)
  const result = analyzeCommand('rm -rf /etc/something', { cwd: tmpCwd });
  assert.notEqual(result, null, 'rm -rf outside cwd should be blocked');
});

test('rm: rm -rf within cwd is ALLOWED (default mode, no paranoid-rm)', () => {
  const dir = makeTmpCwd('rm-cwd');
  try {
    // rm targeting a subpath of cwd is allowed by default
    const result = analyzeCommand(`rm -rf ${dir}/build`, { cwd: dir });
    assert.equal(result, null, 'rm -rf within cwd should be allowed in default mode');
  } finally {
    cleanup(dir);
  }
});

test('rm: rm -rf in /tmp is ALLOWED', () => {
  const result = analyzeCommand('rm -rf /tmp/my-build-artifact', { cwd: tmpCwd });
  assert.equal(result, null, 'rm -rf in /tmp should always be allowed');
});

test('rm: rm -rf in /var/tmp is ALLOWED', () => {
  const result = analyzeCommand('rm -rf /var/tmp/artifact', { cwd: tmpCwd });
  assert.equal(result, null, 'rm -rf in /var/tmp should be allowed');
});

// ---------------------------------------------------------------------------
// Category: find with -delete
// ---------------------------------------------------------------------------

test('find: find . -name "*.log" -delete is BLOCKED', () => {
  const result = analyzeCommand('find . -name "*.log" -delete', { cwd: tmpCwd });
  assert.notEqual(result, null, 'find with -delete should be blocked');
});

test('find: find . -name "*.ts" (no -delete) is ALLOWED', () => {
  const result = analyzeCommand('find . -name "*.ts"', { cwd: tmpCwd });
  assert.equal(result, null, 'find without -delete should be allowed');
});

// ---------------------------------------------------------------------------
// Category: xargs rm -rf
// ---------------------------------------------------------------------------

test('xargs: xargs rm -rf is BLOCKED', () => {
  const result = analyzeCommand('find . -name "*.log" | xargs rm -rf', { cwd: tmpCwd });
  assert.notEqual(result, null, 'xargs rm -rf should be blocked');
});

test('xargs: xargs echo is ALLOWED', () => {
  const result = analyzeCommand('find . -name "*.ts" | xargs echo', { cwd: tmpCwd });
  assert.equal(result, null, 'xargs echo should be allowed');
});

// ---------------------------------------------------------------------------
// Category: Shell wrappers
// ---------------------------------------------------------------------------

test('shell wrapper: bash -c "git reset --hard" is BLOCKED (shell wrapping)', () => {
  const result = analyzeCommand("bash -c 'git reset --hard'", { cwd: tmpCwd, worktreeMode: false });
  assert.notEqual(result, null, 'bash -c with dangerous inner command should be blocked');
});

test('shell wrapper: sh -c "rm -rf /" is BLOCKED', () => {
  const result = analyzeCommand("sh -c 'rm -rf /'", { cwd: tmpCwd });
  assert.notEqual(result, null, 'sh -c with rm -rf / should be blocked');
});

test('shell wrapper: bash -c "echo hello" is ALLOWED', () => {
  const result = analyzeCommand("bash -c 'echo hello'", { cwd: tmpCwd });
  assert.equal(result, null, 'bash -c with safe inner command should be allowed');
});

// ---------------------------------------------------------------------------
// Category: Interpreter one-liners
// ---------------------------------------------------------------------------

test('interpreter: python -c with rm -rf / is BLOCKED (paranoid-interpreters)', () => {
  // Default mode does not block all interpreter one-liners — enable paranoidInterpreters
  const result = analyzeCommand(
    "python3 -c 'import os; os.system(\"rm -rf /\")'",
    { cwd: tmpCwd, paranoidInterpreters: true },
  );
  assert.notEqual(result, null, 'interpreter one-liner with dangerous pattern should be blocked');
});

test('interpreter: python -c "print(1)" is BLOCKED in paranoid-interpreters mode (all one-liners blocked)', () => {
  // paranoidInterpreters blocks ALL interpreter one-liners regardless of content
  const result = analyzeCommand(
    "python3 -c 'print(1)'",
    { cwd: tmpCwd, paranoidInterpreters: true },
  );
  assert.notEqual(result, null, 'paranoidInterpreters blocks all one-liners including safe ones');
});

test('interpreter: node -e "console.log(1)" is ALLOWED in default mode', () => {
  const result = analyzeCommand("node -e 'console.log(1)'", { cwd: tmpCwd });
  assert.equal(result, null, 'safe node -e should be allowed in default mode');
});

// ---------------------------------------------------------------------------
// /safety-net:explain output tests
// ---------------------------------------------------------------------------

test('explain: runExplain returns BLOCKED for git push --force (always blocked)', () => {
  const output = runExplain('git push --force', tmpCwd);
  assert.ok(output.includes('BLOCKED'),
    `expected BLOCKED in explain output, got: "${output}"`);
});

test('explain: runExplain returns ALLOWED for git status', () => {
  const output = runExplain('git status', tmpCwd);
  assert.ok(output.includes('ALLOWED'),
    `expected ALLOWED in explain output, got: "${output}"`);
});

test('explain: runExplain BLOCKED output includes reason', () => {
  const output = runExplain('git push --force', tmpCwd);
  const lines = output.split('\n').filter(l => l.trim());
  // Line 0: BLOCKED, subsequent lines: Reason and/or mode flags
  assert.ok(lines.length >= 2, 'BLOCKED output should have at least status + reason');
  const hasReason = lines.some(l => l.toLowerCase().includes('reason'));
  assert.ok(hasReason, `BLOCKED output should include a Reason line, got:\n${output}`);
});

test('explain: runExplain output always includes mode flags', () => {
  const blocked = runExplain('git push --force', tmpCwd);
  assert.ok(blocked.toLowerCase().includes('worktree'),
    'BLOCKED output should include mode flags');

  const allowed = runExplain('git status', tmpCwd);
  assert.ok(allowed.toLowerCase().includes('worktree'),
    'ALLOWED output should include mode flags');
});

test('explain: runExplain empty arg shows usage', () => {
  const output = runExplain('', tmpCwd);
  assert.ok(
    output.toLowerCase().includes('usage') || output.toLowerCase().includes('provide'),
    `empty arg should show usage, got: "${output}"`
  );
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

// Node test runner doesn't have afterAll, so we clean up at module level after
// all tests are registered using process.on('exit').
process.on('exit', () => {
  cleanup(tmpCwd);
});

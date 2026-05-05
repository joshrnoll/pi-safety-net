/**
 * Tests for ISSUE_00003: Wire tool_call Event to analyzeCommand
 *
 * These tests exercise the hook logic directly (unit-style) without a live pi
 * runtime by importing the handler factory exported from the extension module.
 *
 * Acceptance criteria:
 *  - A blocked command (e.g. `git reset --hard`) produces { block: true, reason: string }
 *  - A safe command (`git status`) produces undefined (allow through)
 *  - Non-bash tool calls are not affected (undefined)
 *  - Env vars for worktree/strict/paranoid modes are respected
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAnalysisOptions,
  handleToolCall,
} from '../extensions/hook.js';

const cwd = process.cwd();

// ---------------------------------------------------------------------------
// buildAnalysisOptions
// ---------------------------------------------------------------------------

test('buildAnalysisOptions: worktree mode is true by default', () => {
  const saved = process.env['SAFETY_NET_WORKTREE'];
  delete process.env['SAFETY_NET_WORKTREE'];
  const opts = buildAnalysisOptions(cwd);
  assert.equal(opts.worktreeMode, true);
  if (saved !== undefined) process.env['SAFETY_NET_WORKTREE'] = saved;
});

test('buildAnalysisOptions: SAFETY_NET_WORKTREE=0 disables worktree mode', () => {
  const saved = process.env['SAFETY_NET_WORKTREE'];
  process.env['SAFETY_NET_WORKTREE'] = '0';
  const opts = buildAnalysisOptions(cwd);
  assert.equal(opts.worktreeMode, false);
  if (saved !== undefined) process.env['SAFETY_NET_WORKTREE'] = saved;
  else delete process.env['SAFETY_NET_WORKTREE'];
});

test('buildAnalysisOptions: SAFETY_NET_STRICT=1 sets strict', () => {
  const saved = process.env['SAFETY_NET_STRICT'];
  process.env['SAFETY_NET_STRICT'] = '1';
  const opts = buildAnalysisOptions(cwd);
  assert.equal(opts.strict, true);
  if (saved !== undefined) process.env['SAFETY_NET_STRICT'] = saved;
  else delete process.env['SAFETY_NET_STRICT'];
});

test('buildAnalysisOptions: SAFETY_NET_PARANOID=1 sets all paranoid flags', () => {
  const saved = process.env['SAFETY_NET_PARANOID'];
  process.env['SAFETY_NET_PARANOID'] = '1';
  const opts = buildAnalysisOptions(cwd);
  assert.equal(opts.paranoidRm, true);
  assert.equal(opts.paranoidInterpreters, true);
  if (saved !== undefined) process.env['SAFETY_NET_PARANOID'] = saved;
  else delete process.env['SAFETY_NET_PARANOID'];
});

// ---------------------------------------------------------------------------
// handleToolCall
// ---------------------------------------------------------------------------

test('handleToolCall: non-bash tool returns undefined', async () => {
  const result = await handleToolCall(
    { type: 'tool_call', toolCallId: '1', toolName: 'read', input: { file_path: '/tmp/test' } } as any,
    cwd,
  );
  assert.equal(result, undefined);
});

test('handleToolCall: safe bash command returns undefined', async () => {
  const result = await handleToolCall(
    { type: 'tool_call', toolCallId: '2', toolName: 'bash', input: { command: 'git status' } },
    cwd,
  );
  assert.equal(result, undefined);
});

test('handleToolCall: dangerous command (git push --force) returns block=true', async () => {
  const result = await handleToolCall(
    { type: 'tool_call', toolCallId: '3', toolName: 'bash', input: { command: 'git push --force' } },
    cwd,
  );
  assert.ok(result, 'should return a result object');
  assert.equal(result?.block, true);
  assert.ok(result?.reason, 'should include a reason');
});

test('handleToolCall: git reset --hard blocked when worktreeMode=false via env', async () => {
  const saved = process.env['SAFETY_NET_WORKTREE'];
  process.env['SAFETY_NET_WORKTREE'] = '0';
  const result = await handleToolCall(
    { type: 'tool_call', toolCallId: '4', toolName: 'bash', input: { command: 'git reset --hard' } },
    cwd,
  );
  if (saved !== undefined) process.env['SAFETY_NET_WORKTREE'] = saved;
  else delete process.env['SAFETY_NET_WORKTREE'];
  assert.ok(result, 'should return a block result');
  assert.equal(result?.block, true);
});

/**
 * Tests for ISSUE_00005: Session-Level Allowlist
 *
 * Acceptance criteria:
 *  - After "Allow for Session" for a command, subsequent calls are skipped without dialog
 *  - The session map being cleared (new Map) simulates session restart — dialog fires again
 *  - Session map does not affect persistent allowlist (Wave 3 adds that check before session map)
 *  - The session key is derived from the blocked segment (command/subcommand format)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleToolCallWithDialog, DIALOG_CHOICES } from '../extensions/dialog.js';
import type { ToolCallEvent } from '@mariozechner/pi-coding-agent';

const cwd = process.cwd();

function bashEvent(command: string): ToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: '1',
    toolName: 'bash',
    input: { command },
  } as any;
}

/** Track how many times the dialog is invoked */
function makeCtxWithCounter(selectResult: string | undefined) {
  let callCount = 0;
  const ctx = {
    hasUI: true,
    cwd,
    ui: {
      select: async () => {
        callCount++;
        return selectResult;
      },
    },
  } as any;
  return { ctx, getCallCount: () => callCount };
}

test('first blocked call triggers dialog', async () => {
  const { ctx, getCallCount } = makeCtxWithCounter(DIALOG_CHOICES.DENY);
  const sessionMap = new Map<string, true>();
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(getCallCount(), 1, 'dialog should be called once');
});

test('after Allow for Session, second call skips dialog and returns undefined', async () => {
  const { ctx, getCallCount } = makeCtxWithCounter(DIALOG_CHOICES.ALLOW_SESSION);
  const sessionMap = new Map<string, true>();

  // First call — user picks Allow for Session
  const first = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(first, undefined, 'first call should allow through');
  assert.equal(getCallCount(), 1);

  // Second call — should skip dialog (session-allowed)
  const second = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(second, undefined, 'second call should be silently allowed');
  assert.equal(getCallCount(), 1, 'dialog should NOT be called again');
});

test('cleared session map causes dialog to fire again (simulates session restart)', async () => {
  const { ctx, getCallCount } = makeCtxWithCounter(DIALOG_CHOICES.ALLOW_SESSION);
  const sessionMap = new Map<string, true>();

  // First session: allow for session
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(getCallCount(), 1);

  // Simulate session restart: clear the map
  sessionMap.clear();

  // Should prompt again
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(getCallCount(), 2, 'dialog should fire again after session map cleared');
});

test('Allow for Session does not affect a different command', async () => {
  const { ctx } = makeCtxWithCounter(DIALOG_CHOICES.ALLOW_SESSION);
  const sessionMap = new Map<string, true>();

  // Allow git push --force for session
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);

  // A different blocked command should still show dialog
  // git stash clear is also always blocked
  const ctx2 = { hasUI: true, cwd, ui: { select: async () => DIALOG_CHOICES.DENY } } as any;
  const result = await handleToolCallWithDialog(bashEvent('git stash clear'), ctx2, sessionMap);
  // Result is Deny — so block=true
  assert.ok(result?.block, 'different command should still be blocked via dialog');
  // Original session map should still allow the first command without dialog
  let dialogCalledForFirst = false;
  const ctx3 = { hasUI: true, cwd, ui: { select: async () => { dialogCalledForFirst = true; return DIALOG_CHOICES.DENY; } } } as any;
  const allowed = await handleToolCallWithDialog(bashEvent('git push --force'), ctx3, sessionMap);
  assert.equal(allowed, undefined, 'previously allowed command should still bypass dialog');
  assert.equal(dialogCalledForFirst, false, 'dialog should not be called for session-allowed command');
});

test('Allow Once does not populate session map', async () => {
  const { ctx, getCallCount } = makeCtxWithCounter(DIALOG_CHOICES.ALLOW_ONCE);
  const sessionMap = new Map<string, true>();

  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(getCallCount(), 1);

  // Second call should show dialog again (Allow Once has no memory)
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap);
  assert.equal(getCallCount(), 2, 'Allow Once should not suppress future prompts');
});

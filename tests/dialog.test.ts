/**
 * Tests for ISSUE_00004: 4-Option Select Dialog
 *
 * We test the dialog-aware handler by providing a fake ctx with a controlled
 * ui.select() implementation, exercising each of the four choice branches and
 * the fallback for non-interactive (hasUI=false) mode.
 *
 * Acceptance criteria:
 *  - A blocked command shows the select dialog with all four options
 *  - "Deny" → { block: true, reason }
 *  - "Allow Once" → undefined (allow, no side effects)
 *  - In print mode (hasUI=false), a blocked command is hard-blocked without dialog
 *  - Cancelled dialog (undefined selection) → { block: true, reason }
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleToolCallWithDialog, DIALOG_CHOICES } from '../extensions/dialog.js';
import type { ToolCallEvent } from '@mariozechner/pi-coding-agent';

const cwd = process.cwd();

/** Build a minimal fake ExtensionContext for testing. */
function makeCtx(
  opts: {
    hasUI?: boolean;
    selectResult?: string | undefined;
    captureTitle?: (t: string) => void;
    captureOptions?: (o: string[]) => void;
  } = {},
) {
  const {
    hasUI = true,
    selectResult = DIALOG_CHOICES.DENY,
    captureTitle,
    captureOptions,
  } = opts;

  return {
    hasUI,
    cwd,
    ui: {
      select: async (title: string, options: string[]) => {
        captureTitle?.(title);
        captureOptions?.(options);
        return selectResult;
      },
    },
  } as any;
}

function bashEvent(command: string): ToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: '99',
    toolName: 'bash',
    input: { command },
  } as any;
}

// ---------------------------------------------------------------------------
// Safe command — dialog should not appear
// ---------------------------------------------------------------------------

test('safe command returns undefined without invoking dialog', async () => {
  let dialogCalled = false;
  const ctx = makeCtx({ captureTitle: () => { dialogCalled = true; } });
  const result = await handleToolCallWithDialog(bashEvent('git status'), ctx, new Map());
  assert.equal(result, undefined);
  assert.equal(dialogCalled, false, 'dialog should not be shown for safe commands');
});

// ---------------------------------------------------------------------------
// Non-interactive (print) mode
// ---------------------------------------------------------------------------

test('hard blocks in print mode without dialog', async () => {
  let dialogCalled = false;
  const ctx = makeCtx({ hasUI: false, captureTitle: () => { dialogCalled = true; } });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.equal(dialogCalled, false, 'dialog should not appear in print mode');
  assert.ok(result, 'should return a block result');
  assert.equal(result?.block, true);
});

// ---------------------------------------------------------------------------
// Dialog choices
// ---------------------------------------------------------------------------

test('dialog is shown with title and four choices for blocked command', async () => {
  let capturedTitle = '';
  let capturedOptions: string[] = [];
  const ctx = makeCtx({
    captureTitle: (t) => { capturedTitle = t; },
    captureOptions: (o) => { capturedOptions = o; },
    selectResult: DIALOG_CHOICES.DENY,
  });
  await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.ok(capturedTitle.length > 0, 'dialog should have a title');
  assert.equal(capturedOptions.length, 4, 'dialog should have exactly 4 choices');
  assert.ok(capturedOptions.includes(DIALOG_CHOICES.DENY));
  assert.ok(capturedOptions.includes(DIALOG_CHOICES.ALLOW_ONCE));
  assert.ok(capturedOptions.includes(DIALOG_CHOICES.ALLOW_SESSION));
  assert.ok(capturedOptions.includes(DIALOG_CHOICES.ALLOW_REMEMBER));
});

test('Deny returns { block: true, reason }', async () => {
  const ctx = makeCtx({ selectResult: DIALOG_CHOICES.DENY });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.ok(result);
  assert.equal(result?.block, true);
  assert.ok(result?.reason);
});

test('Allow Once returns undefined', async () => {
  const ctx = makeCtx({ selectResult: DIALOG_CHOICES.ALLOW_ONCE });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.equal(result, undefined);
});

test('Allow for Session returns undefined', async () => {
  const ctx = makeCtx({ selectResult: DIALOG_CHOICES.ALLOW_SESSION });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.equal(result, undefined);
});

test('Allow and Remember returns undefined (persistent write stubbed)', async () => {
  const ctx = makeCtx({ selectResult: DIALOG_CHOICES.ALLOW_REMEMBER });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.equal(result, undefined);
});

test('Cancelled dialog (undefined selection) treated as Deny', async () => {
  const ctx = makeCtx({ selectResult: undefined });
  const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, new Map());
  assert.ok(result);
  assert.equal(result?.block, true);
});

// ---------------------------------------------------------------------------
// Non-bash tool
// ---------------------------------------------------------------------------

test('non-bash tool returns undefined without dialog', async () => {
  let dialogCalled = false;
  const ctx = makeCtx({ captureTitle: () => { dialogCalled = true; } });
  const event = {
    type: 'tool_call',
    toolCallId: '1',
    toolName: 'read',
    input: { file_path: '/tmp/test' },
  } as any;
  const result = await handleToolCallWithDialog(event, ctx, new Map());
  assert.equal(result, undefined);
  assert.equal(dialogCalled, false);
});

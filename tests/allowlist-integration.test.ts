/**
 * Tests for ISSUE_00008: Check Persistent Allowlist Before Command Analysis
 *
 * Acceptance criteria:
 *  - After "Allow and Remember" for `git reset --hard`, subsequent calls in the
 *    same session pass through without analysis
 *  - After restarting pi (reloading the allowlist), the same command still passes
 *    through (persistent)
 *  - The allowlist check is a key lookup — does not invoke the shell parser
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleToolCallWithDialog, DIALOG_CHOICES } from '../extensions/dialog.js';
import { loadAllowlist, commandToAllowKey } from '../extensions/src/allowlist.js';
import type { ToolCallEvent } from '@mariozechner/pi-coding-agent';

function bashEvent(command: string): ToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: '1',
    toolName: 'bash',
    input: { command },
  } as any;
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi-safety-net-integration-'));
}

function cleanup(dirs: string[]): void {
  for (const d of dirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// commandToAllowKey
// ---------------------------------------------------------------------------

test('commandToAllowKey: git reset --hard → git/reset', () => {
  assert.equal(commandToAllowKey('git reset --hard'), 'git/reset');
});

test('commandToAllowKey: git push --force → git/push', () => {
  assert.equal(commandToAllowKey('git push --force'), 'git/push');
});

test('commandToAllowKey: npm install -g pkg → npm/install', () => {
  assert.equal(commandToAllowKey('npm install -g pkg'), 'npm/install');
});

test('commandToAllowKey: rm -rf dir → rm/-  (second token is flag)', () => {
  // -rf is a flag (second token), so subcommand defaults to '-'
  assert.equal(commandToAllowKey('rm -rf /tmp/test'), 'rm/-');
});

test('commandToAllowKey: single token command → cmd/-', () => {
  assert.equal(commandToAllowKey('ls'), 'ls/-');
});

test('commandToAllowKey: strips leading env assignments', () => {
  assert.equal(commandToAllowKey('FOO=bar git reset --hard'), 'git/reset');
});

// ---------------------------------------------------------------------------
// Allowlist bypass: pre-analysis check
// ---------------------------------------------------------------------------

test('command in allowlist bypasses analysis and dialog entirely', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    // Pre-seed the allowlist with git/push
    fs.writeFileSync(globalFile, JSON.stringify([{ command: 'git', subcommand: 'push', reason: 'test' }]));

    // Load allowlist (simulates session_start)
    const allowlist = loadAllowlist(tmp, globalFile);

    let dialogCalled = false;
    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => { dialogCalled = true; return DIALOG_CHOICES.DENY; } },
    } as any;
    const sessionMap = new Map<string, true>();

    // git push --force would normally be blocked, but it's in the allowlist
    const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);
    assert.equal(result, undefined, 'should pass through without blocking');
    assert.equal(dialogCalled, false, 'dialog should not appear for allowlisted command');
  } finally {
    cleanup([tmp]);
  }
});

test('command NOT in allowlist still goes through analysis and dialog', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const allowlist = loadAllowlist(tmp, globalFile); // empty

    let dialogCalled = false;
    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => { dialogCalled = true; return DIALOG_CHOICES.ALLOW_ONCE; } },
    } as any;
    const sessionMap = new Map<string, true>();

    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);
    assert.equal(dialogCalled, true, 'dialog should appear for non-allowlisted blocked command');
  } finally {
    cleanup([tmp]);
  }
});

// ---------------------------------------------------------------------------
// Allow and Remember: writes to persistent store + updates caches
// ---------------------------------------------------------------------------

test('Allow and Remember saves entry to global file', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const allowlist = loadAllowlist(tmp, globalFile); // empty

    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => DIALOG_CHOICES.ALLOW_REMEMBER },
    } as any;
    const sessionMap = new Map<string, true>();

    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);

    // File should now exist and contain the entry
    assert.equal(fs.existsSync(globalFile), true);
    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0].command, 'git');
    assert.equal(data[0].subcommand, 'push');
  } finally {
    cleanup([tmp]);
  }
});

test('Allow and Remember adds entry to sessionMap', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const allowlist = loadAllowlist(tmp, globalFile);

    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => DIALOG_CHOICES.ALLOW_REMEMBER },
    } as any;
    const sessionMap = new Map<string, true>();

    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);

    // Session map should contain the key so subsequent calls skip dialog
    assert.equal(sessionMap.size, 1);
  } finally {
    cleanup([tmp]);
  }
});

test('after Allow and Remember, same command in same session bypasses dialog', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const allowlist = loadAllowlist(tmp, globalFile);

    let dialogCallCount = 0;
    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => { dialogCallCount++; return DIALOG_CHOICES.ALLOW_REMEMBER; } },
    } as any;
    const sessionMap = new Map<string, true>();

    // First call — dialog appears, user picks Allow and Remember
    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);
    assert.equal(dialogCallCount, 1);

    // Second call — should bypass dialog (via sessionMap)
    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);
    assert.equal(dialogCallCount, 1, 'dialog should not fire again');
  } finally {
    cleanup([tmp]);
  }
});

test('after Allow and Remember, reloaded allowlist bypasses analysis (simulates session restart)', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const allowlist = loadAllowlist(tmp, globalFile); // empty

    const ctx = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => DIALOG_CHOICES.ALLOW_REMEMBER },
    } as any;
    const sessionMap = new Map<string, true>();

    // First session: allow and remember
    await handleToolCallWithDialog(bashEvent('git push --force'), ctx, sessionMap, allowlist, globalFile);

    // Simulate session restart: fresh sessionMap, reload allowlist from disk
    const freshSessionMap = new Map<string, true>();
    const freshAllowlist = loadAllowlist(tmp, globalFile);

    let dialogCalled = false;
    const ctx2 = {
      hasUI: true,
      cwd: tmp,
      ui: { select: async () => { dialogCalled = true; return DIALOG_CHOICES.DENY; } },
    } as any;

    const result = await handleToolCallWithDialog(bashEvent('git push --force'), ctx2, freshSessionMap, freshAllowlist, globalFile);
    assert.equal(result, undefined, 'command should pass through from persistent allowlist');
    assert.equal(dialogCalled, false, 'dialog should not appear after restart');
  } finally {
    cleanup([tmp]);
  }
});

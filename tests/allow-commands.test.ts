/**
 * Tests for ISSUE_00009: /safety-net:allow list command
 *         and ISSUE_00010: /safety-net:allow remove command
 *
 * These tests exercise the command handler functions directly, bypassing the
 * pi ExtensionAPI registration layer.
 *
 * ISSUE_00009 acceptance criteria:
 *  - /safety-net:allow list with an empty allowlist shows "No entries" and file paths
 *  - With entries present, each entry appears as a row with scope, command, subcommand, and reason
 *  - Global and project entries are visually distinguished
 *
 * ISSUE_00010 acceptance criteria:
 *  - /safety-net:allow remove with entries shows a select dialog
 *  - Selecting an entry removes it from the JSON file and the in-session cache
 *  - After removal, the command that was allowed triggers the dialog again in the same session
 *  - /safety-net:allow remove with an empty allowlist shows "No entries to remove"
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  handleAllowList,
  handleAllowRemove,
} from '../extensions/src/allow-commands.js';
import { loadAllowlist } from '../extensions/src/allowlist.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi-safety-net-allow-cmd-'));
}

function cleanup(dirs: string[]): void {
  for (const d of dirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// /safety-net:allow list
// ---------------------------------------------------------------------------

test('allow list: empty allowlists shows "No entries" message', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);

    assert.ok(notified.toLowerCase().includes('no entries'), `Expected "no entries" in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow list: shows global file path in output', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);
    assert.ok(notified.includes(globalFile), `Expected global path in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow list: shows project file path in output', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);
    const expectedProjectPath = path.join(tmp, '.pi', 'safety-net-allows.json');
    assert.ok(notified.includes(expectedProjectPath), `Expected project path in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow list: shows global entries with [global] scope label', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'my reason' },
    ]));

    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);

    assert.ok(notified.includes('global'), `Expected "global" in: ${notified}`);
    assert.ok(notified.includes('git'), `Expected command in: ${notified}`);
    assert.ok(notified.includes('push'), `Expected subcommand in: ${notified}`);
    assert.ok(notified.includes('my reason'), `Expected reason in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow list: shows project entries with [project] scope label', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    fs.writeFileSync(path.join(piDir, 'safety-net-allows.json'), JSON.stringify([
      { command: 'npm', subcommand: 'install', reason: 'project specific' },
    ]));

    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);

    assert.ok(notified.includes('project'), `Expected "project" in: ${notified}`);
    assert.ok(notified.includes('npm'), `Expected command in: ${notified}`);
    assert.ok(notified.includes('install'), `Expected subcommand in: ${notified}`);
    assert.ok(notified.includes('project specific'), `Expected reason in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow list: distinguishes global vs project entries visually', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'global entry' },
    ]));
    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    fs.writeFileSync(path.join(piDir, 'safety-net-allows.json'), JSON.stringify([
      { command: 'npm', reason: 'project entry' },
    ]));

    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as any;

    await handleAllowList(ctx, globalFile);

    // Both scopes should appear
    const globalIdx = notified.indexOf('global');
    const projectIdx = notified.indexOf('project');
    assert.ok(globalIdx >= 0, 'should contain "global"');
    assert.ok(projectIdx >= 0, 'should contain "project"');
    // They should appear separately (not the same position)
    assert.notEqual(globalIdx, projectIdx);
  } finally {
    cleanup([tmp]);
  }
});

// ---------------------------------------------------------------------------
// /safety-net:allow remove
// ---------------------------------------------------------------------------

test('allow remove: empty allowlist shows "No entries to remove"', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: {
        notify: (msg: string) => { notified = msg; },
        select: async () => { throw new Error('select should not be called'); },
      },
    } as any;

    const sessionMap = new Map<string, true>();
    const allowlistCache: any[] = [];

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    assert.ok(notified.toLowerCase().includes('no entries'), `Expected "no entries" in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow remove: shows select dialog with entries', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'test' },
    ]));

    let selectOptions: string[] = [];
    const ctx = {
      cwd: tmp,
      ui: {
        notify: () => {},
        select: async (_title: string, options: string[]) => {
          selectOptions = options;
          return options[0]; // select first
        },
      },
    } as any;

    const sessionMap = new Map<string, true>();
    const allowlistCache = loadAllowlist(tmp, globalFile);

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    assert.ok(selectOptions.length > 0, 'select dialog should have options');
    assert.ok(selectOptions[0]!.includes('git'), `Expected entry in select options: ${selectOptions}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow remove: selecting an entry removes it from the JSON file', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'test' },
      { command: 'npm' },
    ]));

    const ctx = {
      cwd: tmp,
      ui: {
        notify: () => {},
        select: async (_title: string, options: string[]) => options[0]!, // select first
      },
    } as any;

    const sessionMap = new Map<string, true>();
    const allowlistCache = loadAllowlist(tmp, globalFile);

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    const remaining = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(remaining.length, 1, 'one entry should remain after removal');
  } finally {
    cleanup([tmp]);
  }
});

test('allow remove: removes entry from in-session cache', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const entry = { command: 'git', subcommand: 'push', reason: 'test' };
    fs.writeFileSync(globalFile, JSON.stringify([entry]));

    const ctx = {
      cwd: tmp,
      ui: {
        notify: () => {},
        select: async (_title: string, options: string[]) => options[0]!,
      },
    } as any;

    const sessionMap = new Map<string, true>();
    sessionMap.set('git/push', true); // simulate it was session-allowed
    const allowlistCache = loadAllowlist(tmp, globalFile);

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    // In-session cache should no longer contain the key
    assert.equal(sessionMap.has('git/push'), false, 'session map should have entry removed');
    // Allowlist cache should also have it removed
    assert.equal(allowlistCache.length, 0, 'allowlist cache should have entry removed');
  } finally {
    cleanup([tmp]);
  }
});

test('allow remove: shows confirmation message after removal', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'test' },
    ]));

    let notified = '';
    const ctx = {
      cwd: tmp,
      ui: {
        notify: (msg: string) => { notified = msg; },
        select: async (_title: string, options: string[]) => options[0]!,
      },
    } as any;

    const sessionMap = new Map<string, true>();
    const allowlistCache = loadAllowlist(tmp, globalFile);

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    assert.ok(notified.length > 0, 'should show confirmation message');
    assert.ok(notified.toLowerCase().includes('removed') || notified.toLowerCase().includes('git'),
      `Expected confirmation in: ${notified}`);
  } finally {
    cleanup([tmp]);
  }
});

test('allow remove: cancelled dialog (undefined selection) is a no-op', async () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'push', reason: 'test' },
    ]));

    const ctx = {
      cwd: tmp,
      ui: {
        notify: () => {},
        select: async () => undefined, // user cancels
      },
    } as any;

    const sessionMap = new Map<string, true>();
    const allowlistCache = loadAllowlist(tmp, globalFile);

    await handleAllowRemove(ctx, sessionMap, allowlistCache, globalFile);

    // File should be unchanged
    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1, 'entry should remain after cancelled removal');
  } finally {
    cleanup([tmp]);
  }
});

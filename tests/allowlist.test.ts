/**
 * Tests for ISSUE_00007: Persistent Allowlist Load and Save
 *
 * Acceptance criteria:
 *  - loadAllowlist returns a merged list with project entries winning on key collision
 *  - saveAllowEntry creates the file if it does not exist
 *  - A malformed JSON file does not throw — returns empty list for that scope
 *  - removeAllowEntry is idempotent (no error if entry does not exist)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadAllowlist,
  saveAllowEntry,
  removeAllowEntry,
  allowKey,
} from '../extensions/src/allowlist.js';
import type { AllowEntry } from '../extensions/src/allowlist.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi-safety-net-test-'));
}

function cleanup(dirs: string[]): void {
  for (const d of dirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
}



// ---------------------------------------------------------------------------
// allowKey
// ---------------------------------------------------------------------------

test('allowKey with command and subcommand', () => {
  const key = allowKey({ command: 'git', subcommand: 'reset' });
  assert.equal(key, 'git/reset');
});

test('allowKey with command only', () => {
  const key = allowKey({ command: 'npm' });
  assert.equal(key, 'npm/-');
});

// ---------------------------------------------------------------------------
// loadAllowlist
// ---------------------------------------------------------------------------

test('loadAllowlist returns empty array when files do not exist', () => {
  const tmp = makeTmpDir();
  try {
    const entries = loadAllowlist(tmp, path.join(tmp, 'global-allows.json'));
    assert.deepEqual(entries, []);
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist returns entries from global file', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const entry: AllowEntry = { command: 'git', subcommand: 'reset', reason: 'test' };
    fs.writeFileSync(globalFile, JSON.stringify([entry]));

    const entries = loadAllowlist(tmp, globalFile);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.command, 'git');
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist returns entries from project file', () => {
  const tmp = makeTmpDir();
  try {
    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    const projectFile = path.join(piDir, 'safety-net-allows.json');
    const entry: AllowEntry = { command: 'npm', subcommand: 'install' };
    fs.writeFileSync(projectFile, JSON.stringify([entry]));

    const entries = loadAllowlist(tmp, path.join(tmp, 'no-global.json'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.command, 'npm');
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist project entries win over global on key collision', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const globalEntry: AllowEntry = { command: 'git', subcommand: 'reset', reason: 'global reason' };
    fs.writeFileSync(globalFile, JSON.stringify([globalEntry]));

    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    const projectFile = path.join(piDir, 'safety-net-allows.json');
    const projectEntry: AllowEntry = { command: 'git', subcommand: 'reset', reason: 'project reason' };
    fs.writeFileSync(projectFile, JSON.stringify([projectEntry]));

    const entries = loadAllowlist(tmp, globalFile);
    // Only one entry — project wins
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.reason, 'project reason');
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist merges non-colliding global and project entries', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([{ command: 'git', subcommand: 'reset', reason: 'global' }]));

    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    const projectFile = path.join(piDir, 'safety-net-allows.json');
    fs.writeFileSync(projectFile, JSON.stringify([{ command: 'npm', reason: 'project' }]));

    const entries = loadAllowlist(tmp, globalFile);
    assert.equal(entries.length, 2);
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist silently ignores malformed global JSON', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, 'NOT VALID JSON {{{{');

    const entries = loadAllowlist(tmp, globalFile);
    assert.deepEqual(entries, []);
  } finally {
    cleanup([tmp]);
  }
});

test('loadAllowlist silently ignores malformed project JSON', () => {
  const tmp = makeTmpDir();
  try {
    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    fs.writeFileSync(path.join(piDir, 'safety-net-allows.json'), '[bad json');

    const entries = loadAllowlist(tmp, path.join(tmp, 'no-global.json'));
    assert.deepEqual(entries, []);
  } finally {
    cleanup([tmp]);
  }
});

// ---------------------------------------------------------------------------
// saveAllowEntry
// ---------------------------------------------------------------------------

test('saveAllowEntry creates global file if it does not exist', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'new-global.json');
    assert.equal(fs.existsSync(globalFile), false);

    saveAllowEntry({ command: 'git', subcommand: 'push', reason: 'test' }, 'global', tmp, globalFile);

    assert.equal(fs.existsSync(globalFile), true);
    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0]!.command, 'git');
  } finally {
    cleanup([tmp]);
  }
});

test('saveAllowEntry creates project file and parent dir if they do not exist', () => {
  const tmp = makeTmpDir();
  try {
    const projectFile = path.join(tmp, '.pi', 'safety-net-allows.json');
    assert.equal(fs.existsSync(projectFile), false);

    saveAllowEntry({ command: 'npm' }, 'project', tmp, path.join(tmp, 'no-global.json'));

    assert.equal(fs.existsSync(projectFile), true);
    const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0]!.command, 'npm');
  } finally {
    cleanup([tmp]);
  }
});

test('saveAllowEntry upserts entry with same key (no duplicates)', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    const entry: AllowEntry = { command: 'git', subcommand: 'reset', reason: 'old reason' };
    fs.writeFileSync(globalFile, JSON.stringify([entry]));

    saveAllowEntry({ command: 'git', subcommand: 'reset', reason: 'new reason' }, 'global', tmp, globalFile);

    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1, 'should upsert, not duplicate');
    assert.equal(data[0].reason, 'new reason');
  } finally {
    cleanup([tmp]);
  }
});

test('saveAllowEntry appends new entry when key is different', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([{ command: 'git', subcommand: 'reset' }]));

    saveAllowEntry({ command: 'npm' }, 'global', tmp, globalFile);

    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 2);
  } finally {
    cleanup([tmp]);
  }
});

// ---------------------------------------------------------------------------
// removeAllowEntry
// ---------------------------------------------------------------------------

test('removeAllowEntry removes a global entry by key', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([
      { command: 'git', subcommand: 'reset', reason: 'test' },
      { command: 'npm' },
    ]));

    removeAllowEntry('git/reset', 'global', tmp, globalFile);

    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0].command, 'npm');
  } finally {
    cleanup([tmp]);
  }
});

test('removeAllowEntry removes a project entry by key', () => {
  const tmp = makeTmpDir();
  try {
    const piDir = path.join(tmp, '.pi');
    fs.mkdirSync(piDir);
    const projectFile = path.join(piDir, 'safety-net-allows.json');
    fs.writeFileSync(projectFile, JSON.stringify([{ command: 'npm' }]));

    removeAllowEntry('npm/-', 'project', tmp, path.join(tmp, 'no-global.json'));

    const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    assert.equal(data.length, 0);
  } finally {
    cleanup([tmp]);
  }
});

test('removeAllowEntry is idempotent when key does not exist', () => {
  const tmp = makeTmpDir();
  try {
    const globalFile = path.join(tmp, 'global-allows.json');
    fs.writeFileSync(globalFile, JSON.stringify([{ command: 'git', subcommand: 'reset' }]));

    // Removing non-existent key should not throw
    assert.doesNotThrow(() => {
      removeAllowEntry('npm/-', 'global', tmp, globalFile);
    });

    const data = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
    assert.equal(data.length, 1, 'existing entry should be untouched');
  } finally {
    cleanup([tmp]);
  }
});

test('removeAllowEntry is a no-op when file does not exist', () => {
  const tmp = makeTmpDir();
  try {
    assert.doesNotThrow(() => {
      removeAllowEntry('git/reset', 'global', tmp, path.join(tmp, 'nonexistent.json'));
    });
  } finally {
    cleanup([tmp]);
  }
});

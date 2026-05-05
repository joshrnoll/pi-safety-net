/**
 * Tests for ISSUE_00011: Load and Apply Custom Block Rules
 *
 * Acceptance criteria:
 *  - A .pi-safety-net.json with a "block git add -A" rule causes git add -A to trigger a block
 *  - A ~/.pi-safety-net/config.json user rule is active across projects
 *  - A project rule with the same name as a user rule overrides it
 *  - A .safety-net.json file (legacy name) is still loaded if .pi-safety-net.json does not exist
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../extensions/src/core/config.js';
import { analyzeCommand } from '../extensions/src/core/analyze.js';

// ---------------------------------------------------------------------------
// Helper: create an isolated temp working dir for each test
// ---------------------------------------------------------------------------

function makeTmpDir(name: string): string {
  const dir = join(tmpdir(), `pi-safety-net-test-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

const blockGitAddARule = {
  version: 1,
  rules: [
    {
      name: 'no-git-add-all',
      command: 'git',
      subcommand: 'add',
      block_args: ['-A'],
      reason: 'Use explicit file paths instead of git add -A',
    },
  ],
};

const blockNpmInstallGRule = {
  version: 1,
  rules: [
    {
      name: 'no-npm-global',
      command: 'npm',
      subcommand: 'install',
      block_args: ['-g'],
      reason: 'Global npm installs are not allowed',
    },
  ],
};

// ---------------------------------------------------------------------------
// loadConfig path resolution
// ---------------------------------------------------------------------------

test('loadConfig reads .pi-safety-net.json as project config', () => {
  const dir = makeTmpDir('proj-config');
  try {
    writeFileSync(join(dir, '.pi-safety-net.json'), JSON.stringify(blockGitAddARule));
    const config = loadConfig(dir, { userConfigDir: join(tmpdir(), 'no-such-user-config-dir') });
    assert.equal(config.rules.length, 1);
    assert.equal(config.rules[0]!.name, 'no-git-add-all');
  } finally {
    cleanup(dir);
  }
});

test('loadConfig falls back to .safety-net.json when .pi-safety-net.json is absent', () => {
  const dir = makeTmpDir('legacy-config');
  try {
    writeFileSync(join(dir, '.safety-net.json'), JSON.stringify(blockGitAddARule));
    const config = loadConfig(dir, { userConfigDir: join(tmpdir(), 'no-such-user-config-dir') });
    assert.equal(config.rules.length, 1, 'legacy .safety-net.json should be loaded as fallback');
    assert.equal(config.rules[0]!.name, 'no-git-add-all');
  } finally {
    cleanup(dir);
  }
});

test('loadConfig .pi-safety-net.json takes precedence over .safety-net.json', () => {
  const dir = makeTmpDir('precedence');
  try {
    const piConfig = {
      version: 1,
      rules: [{ name: 'pi-rule', command: 'git', block_args: ['push'], reason: 'pi config' }],
    };
    const legacyConfig = {
      version: 1,
      rules: [{ name: 'legacy-rule', command: 'git', block_args: ['pull'], reason: 'legacy' }],
    };
    writeFileSync(join(dir, '.pi-safety-net.json'), JSON.stringify(piConfig));
    writeFileSync(join(dir, '.safety-net.json'), JSON.stringify(legacyConfig));
    const config = loadConfig(dir, { userConfigDir: join(tmpdir(), 'no-such-user-config-dir') });
    assert.equal(config.rules.length, 1);
    assert.equal(config.rules[0]!.name, 'pi-rule', '.pi-safety-net.json should win');
  } finally {
    cleanup(dir);
  }
});

test('loadConfig reads user config from ~/.pi-safety-net/config.json', () => {
  const userDir = makeTmpDir('user-config-dir');
  const projectDir = makeTmpDir('project-for-user');
  try {
    writeFileSync(join(userDir, 'config.json'), JSON.stringify(blockNpmInstallGRule));
    const config = loadConfig(projectDir, { userConfigDir: userDir });
    assert.equal(config.rules.length, 1);
    assert.equal(config.rules[0]!.name, 'no-npm-global');
  } finally {
    cleanup(userDir);
    cleanup(projectDir);
  }
});

test('project rule overrides user rule with the same name', () => {
  const userDir = makeTmpDir('user-override');
  const projectDir = makeTmpDir('project-override');
  try {
    const userConfig = {
      version: 1,
      rules: [
        {
          name: 'shared-rule',
          command: 'npm',
          block_args: ['-g'],
          reason: 'User version',
        },
      ],
    };
    const projectConfig = {
      version: 1,
      rules: [
        {
          name: 'shared-rule', // same name — project wins
          command: 'npm',
          block_args: ['-g'],
          reason: 'Project version',
        },
      ],
    };
    writeFileSync(join(userDir, 'config.json'), JSON.stringify(userConfig));
    writeFileSync(join(projectDir, '.pi-safety-net.json'), JSON.stringify(projectConfig));
    const config = loadConfig(projectDir, { userConfigDir: userDir });
    assert.equal(config.rules.length, 1, 'duplicate name should result in one rule');
    assert.equal(config.rules[0]!.reason, 'Project version', 'project rule should win');
  } finally {
    cleanup(userDir);
    cleanup(projectDir);
  }
});

// ---------------------------------------------------------------------------
// analyzeCommand integration — custom rules trigger a block
// ---------------------------------------------------------------------------

test('git add -A is blocked by a custom rule in .pi-safety-net.json', () => {
  const dir = makeTmpDir('analyze-custom-rule');
  try {
    writeFileSync(join(dir, '.pi-safety-net.json'), JSON.stringify(blockGitAddARule));
    const result = analyzeCommand('git add -A', { cwd: dir });
    assert.notEqual(result, null, 'git add -A should be blocked by custom rule');
    assert.ok(result?.reason?.includes('git add -A'), 'reason should mention the blocked pattern');
  } finally {
    cleanup(dir);
  }
});

test('git add specific-file.ts is allowed even with custom git-add rule', () => {
  const dir = makeTmpDir('analyze-custom-allowed');
  try {
    writeFileSync(join(dir, '.pi-safety-net.json'), JSON.stringify(blockGitAddARule));
    const result = analyzeCommand('git add specific-file.ts', { cwd: dir });
    assert.equal(result, null, 'git add with specific file should not be blocked');
  } finally {
    cleanup(dir);
  }
});

test('user rule from ~/.pi-safety-net/config.json causes block via analyzeCommand', () => {
  const userDir = makeTmpDir('user-analyze');
  const projectDir = makeTmpDir('project-analyze');
  try {
    writeFileSync(join(userDir, 'config.json'), JSON.stringify(blockNpmInstallGRule));
    // Load config explicitly with the custom userConfigDir and pass to analyzeCommand
    const config = loadConfig(projectDir, { userConfigDir: userDir });
    const result = analyzeCommand('npm install -g lodash', { cwd: projectDir, config });
    assert.notEqual(result, null, 'npm install -g should be blocked by user config rule');
  } finally {
    cleanup(userDir);
    cleanup(projectDir);
  }
});

/**
 * Tests for ISSUE_00012: Audit Logging and Secret Redaction
 *
 * Acceptance criteria:
 *  - After a blocked command (Deny or Allow Once), a JSONL entry appears in
 *    ~/.pi-safety-net/logs/<session-id>.jsonl
 *  - A command containing MY_TOKEN=abc123 has the token value redacted to
 *    <redacted> in both the log and dialog display
 *  - The log directory is created automatically if it does not exist
 *  - Non-blocked commands produce no log entry
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeAuditLog,
  redactSecrets,
  sanitizeSessionIdForFilename,
} from '../extensions/src/core/audit.js';
import { handleToolCallWithDialog, DIALOG_CHOICES } from '../extensions/dialog.js';
import type { ToolCallEvent } from '@mariozechner/pi-coding-agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(name: string): string {
  const dir = join(tmpdir(), `pi-safety-net-audit-test-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function bashEvent(command: string): ToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: '99',
    toolName: 'bash',
    input: { command },
  } as any;
}

function makeCtx(
  opts: {
    hasUI?: boolean;
    selectResult?: string | undefined;
  } = {},
  logsDir?: string,
) {
  const { hasUI = true, selectResult = DIALOG_CHOICES.DENY } = opts;
  return {
    hasUI,
    cwd: process.cwd(),
    ui: {
      select: async (_title: string, _options: string[]) => selectResult,
      setStatus: () => {},
    },
    logsDir, // injected for testing — the handler reads this if present
  } as any;
}

// ---------------------------------------------------------------------------
// writeAuditLog: path uses ~/.pi-safety-net/logs/
// ---------------------------------------------------------------------------

test('writeAuditLog writes a JSONL entry to the pi-safety-net logs directory', () => {
  const homeDir = makeTmpDir('home');
  try {
    writeAuditLog('test-session-001', 'git push --force', 'git push --force', 'force push is blocked', '/tmp', {
      homeDir,
    });

    const logFile = join(homeDir, '.pi-safety-net', 'logs', 'test-session-001.jsonl');
    assert.ok(existsSync(logFile), `log file should exist at ${logFile}`);

    const line = readFileSync(logFile, 'utf-8').trim();
    const entry = JSON.parse(line) as Record<string, unknown>;
    assert.equal(entry['command'], 'git push --force');
    assert.equal(entry['segment'], 'git push --force');
    assert.equal(entry['reason'], 'force push is blocked');
    assert.ok(typeof entry['ts'] === 'string', 'ts should be an ISO timestamp string');
  } finally {
    cleanup(homeDir);
  }
});

test('writeAuditLog creates the log directory automatically if it does not exist', () => {
  const homeDir = makeTmpDir('home-nodir');
  const logsDir = join(homeDir, '.pi-safety-net', 'logs');
  try {
    assert.ok(!existsSync(logsDir), 'logs dir should not exist before first write');
    writeAuditLog('auto-create-test', 'rm -rf /', 'rm -rf /', 'root deletion blocked', null, {
      homeDir,
    });
    assert.ok(existsSync(logsDir), 'logs dir should be auto-created on first write');
  } finally {
    cleanup(homeDir);
  }
});

test('writeAuditLog redacts secrets in the command before writing', () => {
  const homeDir = makeTmpDir('home-redact');
  try {
    writeAuditLog(
      'redact-test',
      'MY_TOKEN=abc123 git push',
      'MY_TOKEN=abc123 git push',
      'reason',
      '/tmp',
      { homeDir },
    );
    const logFile = join(homeDir, '.pi-safety-net', 'logs', 'redact-test.jsonl');
    const line = readFileSync(logFile, 'utf-8').trim();
    const entry = JSON.parse(line) as Record<string, unknown>;
    assert.ok(
      !(entry['command'] as string).includes('abc123'),
      'token value should be redacted in log',
    );
    assert.ok(
      (entry['command'] as string).includes('<redacted>'),
      'command should contain <redacted> placeholder',
    );
  } finally {
    cleanup(homeDir);
  }
});

test('writeAuditLog appends multiple entries to the same file', () => {
  const homeDir = makeTmpDir('home-append');
  try {
    writeAuditLog('multi-session', 'git push --force', 'git push --force', 'force push', '/cwd', { homeDir });
    writeAuditLog('multi-session', 'rm -rf /', 'rm -rf /', 'root deletion', '/cwd', { homeDir });

    const logFile = join(homeDir, '.pi-safety-net', 'logs', 'multi-session.jsonl');
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2, 'should have two JSONL entries');
  } finally {
    cleanup(homeDir);
  }
});

// ---------------------------------------------------------------------------
// redactSecrets: unit tests
// ---------------------------------------------------------------------------

test('redactSecrets removes MY_TOKEN=<value> patterns', () => {
  const input = 'MY_TOKEN=abc123 git push origin main';
  const result = redactSecrets(input);
  assert.ok(!result.includes('abc123'), 'token value should be removed');
  assert.ok(result.includes('<redacted>'), 'placeholder should appear');
});

test('redactSecrets handles PASSWORD= patterns', () => {
  const input = 'DB_PASSWORD=supersecret npm run migrate';
  const result = redactSecrets(input);
  assert.ok(!result.includes('supersecret'));
  assert.ok(result.includes('<redacted>'));
});

test('redactSecrets handles GitHub token prefix patterns', () => {
  const input = 'echo ghp_ABCDEF1234567890ABCDEF1234567890AB';
  const result = redactSecrets(input);
  assert.ok(!result.includes('ghp_ABCDEF'), 'GitHub token should be redacted');
  assert.ok(result.includes('<redacted>'));
});

test('redactSecrets handles Authorization headers', () => {
  const input = 'curl -H "authorization: Bearer my-secret-token" https://api.example.com';
  const result = redactSecrets(input);
  assert.ok(!result.includes('my-secret-token'), 'auth header value should be redacted');
});

test('redactSecrets leaves non-secret text unchanged', () => {
  const input = 'git status --short';
  const result = redactSecrets(input);
  assert.equal(result, input, 'non-secret commands should pass through unchanged');
});

// ---------------------------------------------------------------------------
// sanitizeSessionIdForFilename
// ---------------------------------------------------------------------------

test('sanitizeSessionIdForFilename accepts normal session IDs', () => {
  assert.equal(sanitizeSessionIdForFilename('my-session-001'), 'my-session-001');
  assert.equal(sanitizeSessionIdForFilename('abc123'), 'abc123');
});

test('sanitizeSessionIdForFilename rejects empty strings', () => {
  assert.equal(sanitizeSessionIdForFilename(''), null);
  assert.equal(sanitizeSessionIdForFilename('   '), null);
});

test('sanitizeSessionIdForFilename sanitizes path traversal', () => {
  const result = sanitizeSessionIdForFilename('../../../etc/passwd');
  assert.ok(result !== null, 'should return a sanitized value, not null');
  assert.ok(!result!.includes('/'), 'result should not contain path separators');
  assert.ok(!result!.includes('..'), 'result should not contain ..');
});

// ---------------------------------------------------------------------------
// Integration: handleToolCallWithDialog writes audit log for blocked commands
// ---------------------------------------------------------------------------

test('dialog handler writes audit log entry when command is blocked (Deny)', async () => {
  const homeDir = makeTmpDir('dialog-audit-deny');
  // Override the home directory used for audit logging via env
  const origHome = process.env['PI_SAFETY_NET_LOG_HOME'];
  process.env['PI_SAFETY_NET_LOG_HOME'] = homeDir;
  try {
    const ctx = makeCtx({ selectResult: DIALOG_CHOICES.DENY });
    const sessionMap = new Map<string, true>();
    const result = await handleToolCallWithDialog(
      bashEvent('git push --force'),
      ctx,
      sessionMap,
      [],
      undefined,
      undefined,
      'test-session-deny',
    );
    assert.ok(result?.block === true, 'Deny should block the command');

    const logDir = join(homeDir, '.pi-safety-net', 'logs');
    const logFile = join(logDir, 'test-session-deny.jsonl');
    assert.ok(existsSync(logFile), 'audit log should be created');
    const entry = JSON.parse(readFileSync(logFile, 'utf-8').trim()) as Record<string, unknown>;
    assert.ok((entry['command'] as string).includes('git push'), 'command should be logged');
    assert.ok(typeof entry['reason'] === 'string', 'reason should be logged');
  } finally {
    if (origHome === undefined) {
      delete process.env['PI_SAFETY_NET_LOG_HOME'];
    } else {
      process.env['PI_SAFETY_NET_LOG_HOME'] = origHome;
    }
    cleanup(homeDir);
  }
});

test('dialog handler writes audit log entry when command is allowed once', async () => {
  const homeDir = makeTmpDir('dialog-audit-allow-once');
  const origHome = process.env['PI_SAFETY_NET_LOG_HOME'];
  process.env['PI_SAFETY_NET_LOG_HOME'] = homeDir;
  try {
    const ctx = makeCtx({ selectResult: DIALOG_CHOICES.ALLOW_ONCE });
    const result = await handleToolCallWithDialog(
      bashEvent('git push --force'),
      ctx,
      new Map(),
      [],
      undefined,
      undefined,
      'test-session-allow-once',
    );
    assert.equal(result, undefined, 'Allow Once should not block');

    const logFile = join(homeDir, '.pi-safety-net', 'logs', 'test-session-allow-once.jsonl');
    assert.ok(existsSync(logFile), 'audit log should still be written even when user allows');
  } finally {
    if (origHome === undefined) {
      delete process.env['PI_SAFETY_NET_LOG_HOME'];
    } else {
      process.env['PI_SAFETY_NET_LOG_HOME'] = origHome;
    }
    cleanup(homeDir);
  }
});

test('dialog handler does NOT write audit log for safe (non-blocked) commands', async () => {
  const homeDir = makeTmpDir('dialog-audit-safe');
  const origHome = process.env['PI_SAFETY_NET_LOG_HOME'];
  process.env['PI_SAFETY_NET_LOG_HOME'] = homeDir;
  try {
    const ctx = makeCtx({});
    await handleToolCallWithDialog(bashEvent('git status'), ctx, new Map(), [], undefined, undefined, 'safe-session');

    const logDir = join(homeDir, '.pi-safety-net', 'logs');
    const logFile = join(logDir, 'safe-session.jsonl');
    assert.ok(!existsSync(logFile), 'audit log should NOT be written for safe commands');
  } finally {
    if (origHome === undefined) {
      delete process.env['PI_SAFETY_NET_LOG_HOME'];
    } else {
      process.env['PI_SAFETY_NET_LOG_HOME'] = origHome;
    }
    cleanup(homeDir);
  }
});

test('dialog body redacts secrets in the command shown', async () => {
  const homeDir = makeTmpDir('dialog-redact');
  const origHome = process.env['PI_SAFETY_NET_LOG_HOME'];
  process.env['PI_SAFETY_NET_LOG_HOME'] = homeDir;

  const capturedTitles: string[] = [];
  const ctx = {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      select: async (title: string, _options: string[]) => {
        capturedTitles.push(title);
        return DIALOG_CHOICES.DENY;
      },
      setStatus: () => {},
    },
  } as any;

  try {
    // Use a command that analyzeCommand will block AND that contains a secret
    // git push --force is always blocked; we add a token env var
    await handleToolCallWithDialog(
      bashEvent('MY_TOKEN=abc123 git push --force'),
      ctx,
      new Map(),
      [],
      undefined,
      undefined,
      'redact-dialog-session',
    );

    assert.ok(capturedTitles.length > 0, 'dialog should have been shown');
    const dialogTitle = capturedTitles[0]!;
    assert.ok(!dialogTitle.includes('abc123'), 'secret should be redacted from dialog title');
    assert.ok(dialogTitle.includes('<redacted>'), 'dialog should show <redacted> placeholder');
  } finally {
    if (origHome === undefined) {
      delete process.env['PI_SAFETY_NET_LOG_HOME'];
    } else {
      process.env['PI_SAFETY_NET_LOG_HOME'] = origHome;
    }
    cleanup(homeDir);
  }
});

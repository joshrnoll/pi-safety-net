/**
 * Tests for ISSUE_00006: Mode-Aware Status Indicator
 *
 * Acceptance criteria:
 *  - Default (no env vars): "🛡️ Safety Net ✅"
 *  - SAFETY_NET_STRICT=1: "🛡️ Safety Net 🔒"
 *  - SAFETY_NET_PARANOID=1: "🛡️ Safety Net 👁️"
 *  - SAFETY_NET_PARANOID_RM=1: "🛡️ Safety Net 🗑️"
 *  - SAFETY_NET_PARANOID_INTERPRETERS=1: "🛡️ Safety Net 🐚"
 *  - SAFETY_NET_WORKTREE=0: appends "⚠️" after other emojis
 *  - Multiple modes combine emojis (e.g. strict+paranoid)
 */

import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { buildStatusText } from '../extensions/status.js';

// Save and restore env vars around each test
const ENV_VARS = [
  'SAFETY_NET_STRICT',
  'SAFETY_NET_PARANOID',
  'SAFETY_NET_PARANOID_RM',
  'SAFETY_NET_PARANOID_INTERPRETERS',
  'SAFETY_NET_WORKTREE',
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
    else delete process.env[k];
  }
});

test('default (no env vars): shows ✅', () => {
  assert.equal(buildStatusText(), '🛡️ Safety Net ✅');
});

test('SAFETY_NET_STRICT=1: shows 🔒', () => {
  process.env['SAFETY_NET_STRICT'] = '1';
  const text = buildStatusText();
  assert.ok(text.includes('🔒'), `expected 🔒 in "${text}"`);
  assert.ok(!text.includes('✅'), `should not include ✅ in "${text}"`);
});

test('SAFETY_NET_PARANOID=1: shows 👁️', () => {
  process.env['SAFETY_NET_PARANOID'] = '1';
  const text = buildStatusText();
  assert.ok(text.includes('👁️'), `expected 👁️ in "${text}"`);
});

test('SAFETY_NET_PARANOID_RM=1: shows 🗑️', () => {
  process.env['SAFETY_NET_PARANOID_RM'] = '1';
  const text = buildStatusText();
  assert.ok(text.includes('🗑️'), `expected 🗑️ in "${text}"`);
});

test('SAFETY_NET_PARANOID_INTERPRETERS=1: shows 🐚', () => {
  process.env['SAFETY_NET_PARANOID_INTERPRETERS'] = '1';
  const text = buildStatusText();
  assert.ok(text.includes('🐚'), `expected 🐚 in "${text}"`);
});

test('SAFETY_NET_WORKTREE=0: appends ⚠️', () => {
  process.env['SAFETY_NET_WORKTREE'] = '0';
  const text = buildStatusText();
  assert.ok(text.includes('⚠️'), `expected ⚠️ in "${text}"`);
});

test('STRICT+PARANOID combines emojis 🔒👁️', () => {
  process.env['SAFETY_NET_STRICT'] = '1';
  process.env['SAFETY_NET_PARANOID'] = '1';
  const text = buildStatusText();
  assert.ok(text.includes('🔒'), `expected 🔒 in "${text}"`);
  assert.ok(text.includes('👁️'), `expected 👁️ in "${text}"`);
});

test('STRICT+WORKTREE=0 combines 🔒 and ⚠️', () => {
  process.env['SAFETY_NET_STRICT'] = '1';
  process.env['SAFETY_NET_WORKTREE'] = '0';
  const text = buildStatusText();
  assert.ok(text.includes('🔒'), `expected 🔒 in "${text}"`);
  assert.ok(text.includes('⚠️'), `expected ⚠️ in "${text}"`);
});

test('all values start with prefix "🛡️ Safety Net"', () => {
  for (const [key, val] of [
    ['SAFETY_NET_STRICT', '1'],
    ['SAFETY_NET_PARANOID', '1'],
    ['SAFETY_NET_WORKTREE', '0'],
  ] as [string, string][]) {
    process.env[key] = val;
  }
  const text = buildStatusText();
  assert.ok(text.startsWith('🛡️ Safety Net'), `expected prefix in "${text}"`);
});

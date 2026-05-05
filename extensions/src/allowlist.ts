/**
 * Persistent allowlist module for pi-safety-net (ISSUE_00007).
 *
 * Manages two JSON allowlist files:
 *   - Global:  ~/.pi/agent/safety-net-allows.json
 *   - Project: <cwd>/.pi/safety-net-allows.json
 *
 * On key collision (same command/subcommand), project entries win.
 * Parse errors in either file are silently ignored (safe fallback to empty list).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllowEntry {
  command: string;
  subcommand?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a lookup key from an AllowEntry.
 * Format: "<command>/<subcommand>" — subcommand defaults to "-" when absent.
 */
export function allowKey(entry: Pick<AllowEntry, 'command' | 'subcommand'>): string {
  return `${entry.command}/${entry.subcommand ?? '-'}`;
}

/**
 * Derive a lookup key from a raw shell command string.
 *
 * This is a lightweight, parser-free extraction of the first command and
 * second positional token — intentionally simple so it can be used before
 * invoking the full analysis engine.
 *
 * Uses the same rule as the session-map key: look at the second whitespace-
 * separated token; if it starts with "-" (a flag), subcommand defaults to
 * "-". This keeps keys consistent between the pre-analysis allowlist check
 * and the post-analysis session-map entry written by the dialog handler.
 *
 * Algorithm:
 *   1. Split on whitespace
 *   2. Skip leading KEY=VALUE env assignments
 *   3. First remaining token → command
 *   4. Second token: if it starts with "-" → subcommand "-"; else → subcommand
 */
export function commandToAllowKey(rawCommand: string): string {
  // Env-assignment pattern: TOKEN=VALUE
  const envPattern = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const tokens = rawCommand.trim().split(/\s+/).filter(Boolean);

  let i = 0;
  // Skip leading env assignments
  while (i < tokens.length && envPattern.test(tokens[i]!)) i++;

  const cmd = tokens[i] ?? '-';
  i++;

  // Look at second token (same rule as sessionKey in dialog.ts)
  const second = tokens[i];
  const sub = second === undefined || second.startsWith('-') ? '-' : second;

  return `${cmd}/${sub}`;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** Default global allowlist path: ~/.pi/agent/safety-net-allows.json */
export function defaultGlobalPath(): string {
  return path.join(os.homedir(), '.pi', 'agent', 'safety-net-allows.json');
}

/** Project allowlist path: <cwd>/.pi/safety-net-allows.json */
function projectPath(cwd: string): string {
  return path.join(cwd, '.pi', 'safety-net-allows.json');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readEntries(filePath: string): AllowEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AllowEntry[];
  } catch {
    // Silently ignore parse errors
    return [];
  }
}

function writeEntries(filePath: string, entries: AllowEntry[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and merge global + project allowlists.
 * Project entries win on key collision.
 *
 * @param cwd        Current working directory (used to resolve project allowlist path)
 * @param globalFile Override for the global allowlist path (defaults to ~/.pi/agent/...)
 */
export function loadAllowlist(
  cwd: string,
  globalFile: string = defaultGlobalPath(),
): AllowEntry[] {
  const globalEntries = readEntries(globalFile);
  const projectEntries = readEntries(projectPath(cwd));

  // Build a map seeded with global entries, overridden by project entries
  const map = new Map<string, AllowEntry>();
  for (const e of globalEntries) {
    map.set(allowKey(e), e);
  }
  for (const e of projectEntries) {
    map.set(allowKey(e), e);
  }
  return Array.from(map.values());
}

/**
 * Append or upsert an entry in the appropriate allowlist file.
 * Upserts by key — no duplicate entries for the same command/subcommand.
 *
 * @param entry      The entry to save
 * @param scope      'global' writes to ~/.pi/agent/..., 'project' writes to <cwd>/.pi/...
 * @param cwd        Current working directory
 * @param globalFile Override for the global allowlist path
 */
export function saveAllowEntry(
  entry: AllowEntry,
  scope: 'global' | 'project',
  cwd: string,
  globalFile: string = defaultGlobalPath(),
): void {
  const filePath = scope === 'global' ? globalFile : projectPath(cwd);
  const existing = readEntries(filePath);
  const key = allowKey(entry);

  const idx = existing.findIndex((e) => allowKey(e) === key);
  if (idx >= 0) {
    existing[idx] = entry; // upsert
  } else {
    existing.push(entry);
  }
  writeEntries(filePath, existing);
}

/**
 * Remove an entry by key from the appropriate allowlist file.
 * Idempotent — does not throw if the entry does not exist.
 *
 * @param key        The key to remove (e.g. "git/reset")
 * @param scope      'global' or 'project'
 * @param cwd        Current working directory
 * @param globalFile Override for the global allowlist path
 */
export function removeAllowEntry(
  key: string,
  scope: 'global' | 'project',
  cwd: string,
  globalFile: string = defaultGlobalPath(),
): void {
  const filePath = scope === 'global' ? globalFile : projectPath(cwd);
  if (!fs.existsSync(filePath)) return; // idempotent when file absent
  const existing = readEntries(filePath);
  const filtered = existing.filter((e) => allowKey(e) !== key);
  if (filtered.length === existing.length) return; // nothing to remove
  writeEntries(filePath, filtered);
}

/**
 * /safety-net:allow command handlers for pi-safety-net.
 *
 * Implements two sub-commands:
 *   - list:   Display all entries from global and project allowlists
 *   - remove: Interactive select to remove an entry from the allowlist
 *
 * These handlers are pure functions over ctx — they do not depend on the pi
 * ExtensionAPI registration layer, making them independently testable.
 */

import path from 'node:path';
import os from 'node:os';
import {
  loadAllowlist,
  removeAllowEntry,
  allowKey,
  defaultGlobalPath,
} from './allowlist.js';
import type { AllowEntry } from './allowlist.js';

// ---------------------------------------------------------------------------
// Types (minimal ctx shapes needed by the handlers)
// ---------------------------------------------------------------------------

interface AllowCmdCtx {
  cwd: string;
  ui: {
    notify: (msg: string) => void;
    select?: (title: string, options: string[]) => Promise<string | undefined>;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function globalFilePath(override?: string): string {
  return override ?? defaultGlobalPath();
}

function projectFilePath(cwd: string): string {
  return path.join(cwd, '.pi', 'safety-net-allows.json');
}

/**
 * Load global and project lists SEPARATELY (not merged) so we can tag each
 * entry with its scope for display and removal purposes.
 */
function loadScopedEntries(
  cwd: string,
  globalFile: string,
): Array<{ scope: 'global' | 'project'; entry: AllowEntry }> {
  // Re-use the raw read helpers by loading each file independently.
  // We load the merged list and then tag by re-reading each file.
  // This avoids duplicating the parse-error-safe logic.

  const globalMerged = loadAllowlist('/nonexistent-cwd-to-skip-project', globalFile);
  const projectMerged = loadAllowlist(cwd, path.join(os.tmpdir(), '_no_global_'));

  return [
    ...globalMerged.map((e) => ({ scope: 'global' as const, entry: e })),
    ...projectMerged.map((e) => ({ scope: 'project' as const, entry: e })),
  ];
}

function formatEntry(entry: AllowEntry): string {
  const sub = entry.subcommand ?? '-';
  const reason = entry.reason ? ` (${entry.reason})` : '';
  return `${entry.command}/${sub}${reason}`;
}

// ---------------------------------------------------------------------------
// /safety-net:allow list
// ---------------------------------------------------------------------------

/**
 * Handle the `list` sub-command of /safety-net:allow.
 *
 * Displays all entries from both the global and project allowlists,
 * tagging each with its scope. Includes file paths in the header.
 */
export async function handleAllowList(
  ctx: AllowCmdCtx,
  globalFile: string = globalFilePath(),
): Promise<void> {
  const projectFile = projectFilePath(ctx.cwd);
  const scoped = loadScopedEntries(ctx.cwd, globalFile);

  const header = [
    `📋 Safety Net Allowlist`,
    `  Global:  ${globalFile}`,
    `  Project: ${projectFile}`,
    '',
  ].join('\n');

  if (scoped.length === 0) {
    ctx.ui.notify(`${header}No entries in allowlist.`);
    return;
  }

  // Build a table: scope | command | subcommand | reason
  const rows = scoped.map(({ scope, entry }) => {
    const sub = entry.subcommand ?? '-';
    const reason = entry.reason ?? '';
    return `  [${scope}]  ${entry.command.padEnd(12)}  ${sub.padEnd(12)}  ${reason}`;
  });

  const table = [
    `  ${'Scope'.padEnd(9)}  ${'Command'.padEnd(12)}  ${'Subcommand'.padEnd(12)}  Reason`,
    `  ${'-'.repeat(60)}`,
    ...rows,
  ].join('\n');

  ctx.ui.notify(`${header}${table}`);
}

// ---------------------------------------------------------------------------
// /safety-net:allow remove
// ---------------------------------------------------------------------------

/**
 * Handle the `remove` sub-command of /safety-net:allow.
 *
 * Presents an interactive select dialog over all allowlist entries. On
 * selection, removes the entry from the backing JSON file, the in-memory
 * allowlistCache array, and the session-level allow map.
 */
export async function handleAllowRemove(
  ctx: AllowCmdCtx,
  sessionMap: Map<string, true>,
  allowlistCache: AllowEntry[],
  globalFile: string = globalFilePath(),
): Promise<void> {
  const scoped = loadScopedEntries(ctx.cwd, globalFile);

  if (scoped.length === 0) {
    ctx.ui.notify('No entries to remove from the allowlist.');
    return;
  }

  if (!ctx.ui.select) {
    ctx.ui.notify('Interactive select not available in this mode.');
    return;
  }

  // Build display labels for the dialog
  const labels = scoped.map(({ scope, entry }) => `[${scope}] ${formatEntry(entry)}`);

  const choice = await ctx.ui.select('Remove allowlist entry:', labels);
  if (choice === undefined) return; // user cancelled — no-op

  const idx = labels.indexOf(choice);
  if (idx < 0) return; // shouldn't happen

  const { scope, entry } = scoped[idx]!;
  const key = allowKey(entry);

  // Remove from the backing JSON file
  removeAllowEntry(key, scope, ctx.cwd, globalFile);

  // Remove from the in-memory allowlistCache (mutate in place)
  const cacheIdx = allowlistCache.findIndex((e) => allowKey(e) === key);
  if (cacheIdx >= 0) allowlistCache.splice(cacheIdx, 1);

  // Remove from the session map
  sessionMap.delete(key);

  ctx.ui.notify(`✅ Removed: [${scope}] ${formatEntry(entry)}`);
}

/**
 * Vendored from cc-safety-net (MIT License)
 * Original author: kenryu42 (J Liew)
 * Source: https://github.com/kenryu42/claude-code-safety-net
 *
 * Modifications for pi-safety-net:
 *   - Replaced @/ path aliases with relative imports
 *   - Worktree mode enabled by default (see analyze.ts)
 */

import { analyzeCommandInternal } from './analyze/analyze-command';
import { findHasDelete } from './analyze/find';
import { extractParallelChildCommand } from './analyze/parallel';
import { hasRecursiveForceFlags } from './analyze/rm-flags';
import { segmentChangesCwd } from './analyze/segment';
import { extractXargsChildCommand, extractXargsChildCommandWithInfo } from './analyze/xargs';
import { loadConfig } from './config';
import type { AnalyzeOptions, AnalyzeResult } from '../types';

/**
 * Worktree mode is ON by default in pi-safety-net.
 * Set SAFETY_NET_WORKTREE=0 to disable.
 */
const DEFAULT_WORKTREE_MODE = process.env['SAFETY_NET_WORKTREE'] !== '0';

export function analyzeCommand(
  command: string,
  options: AnalyzeOptions = {},
): AnalyzeResult | null {
  const config = options.config ?? loadConfig(options.cwd);
  const worktreeMode = options.worktreeMode ?? DEFAULT_WORKTREE_MODE;
  return analyzeCommandInternal(command, 0, { ...options, config, worktreeMode });
}

export { loadConfig };

/** @internal Exported for testing */
export { findHasDelete as _findHasDelete };
/** @internal Exported for testing */
export { extractParallelChildCommand as _extractParallelChildCommand };
/** @internal Exported for testing */
export { hasRecursiveForceFlags as _hasRecursiveForceFlags };
/** @internal Exported for testing */
export { segmentChangesCwd as _segmentChangesCwd };
/** @internal Exported for testing */
export { extractXargsChildCommand as _extractXargsChildCommand };
/** @internal Exported for testing */
export { extractXargsChildCommandWithInfo as _extractXargsChildCommandWithInfo };

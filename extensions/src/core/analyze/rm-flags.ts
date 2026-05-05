/**
 * Vendored from cc-safety-net (MIT License)
 * Original author: kenryu42 (J Liew)
 * Source: https://github.com/kenryu42/claude-code-safety-net
 *
 * Modifications for pi-safety-net:
 *   - Replaced @/ path aliases with relative imports
 *   - Worktree mode enabled by default (see analyze.ts)
 */

export function hasRecursiveForceFlags(tokens: readonly string[]): boolean {
  let hasRecursive = false;
  let hasForce = false;

  for (const token of tokens) {
    if (token === '--') break;

    if (token === '-r' || token === '-R' || token === '--recursive') {
      hasRecursive = true;
    } else if (token === '-f' || token === '--force') {
      hasForce = true;
    } else if (token.startsWith('-') && !token.startsWith('--')) {
      if (token.includes('r') || token.includes('R')) hasRecursive = true;
      if (token.includes('f')) hasForce = true;
    }
  }

  return hasRecursive && hasForce;
}

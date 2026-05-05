/**
 * Vendored from cc-safety-net (MIT License)
 * Original author: kenryu42 (J Liew)
 * Source: https://github.com/kenryu42/claude-code-safety-net
 *
 * Modifications for pi-safety-net:
 *   - Replaced @/ path aliases with relative imports
 *   - Worktree mode enabled by default (see analyze.ts)
 */

import { extractShortOpts, getBasename } from './shell';
import type { CustomRule } from '../types';

export function checkCustomRules(tokens: string[], rules: CustomRule[]): string | null {
  if (tokens.length === 0 || rules.length === 0) {
    return null;
  }

  const command = getBasename(tokens[0] ?? '');
  const subcommand = extractSubcommand(tokens);
  const shortOpts = extractShortOpts(tokens);

  for (const rule of rules) {
    if (!matchesCommand(command, rule.command)) {
      continue;
    }

    if (rule.subcommand && subcommand !== rule.subcommand) {
      continue;
    }

    if (matchesBlockArgs(tokens, rule.block_args, shortOpts)) {
      return `[${rule.name}] ${rule.reason}`;
    }
  }

  return null;
}

function matchesCommand(command: string, ruleCommand: string): boolean {
  return command === ruleCommand;
}

const OPTIONS_WITH_VALUES = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
]);

function extractSubcommand(tokens: string[]): string | null {
  let skipNext = false;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return nextToken;
      }
      return null;
    }

    if (OPTIONS_WITH_VALUES.has(token)) {
      skipNext = true;
      continue;
    }

    if (token.startsWith('-')) {
      for (const opt of OPTIONS_WITH_VALUES) {
        if (token.startsWith(`${opt}=`)) {
          break;
        }
      }
      continue;
    }

    return token;
  }

  return null;
}

function matchesBlockArgs(tokens: string[], blockArgs: string[], shortOpts: Set<string>): boolean {
  const blockArgsSet = new Set(blockArgs);

  for (const token of tokens) {
    if (blockArgsSet.has(token)) {
      return true;
    }
  }

  for (const opt of shortOpts) {
    if (blockArgsSet.has(opt)) {
      return true;
    }
  }

  return false;
}

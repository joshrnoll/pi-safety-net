/**
 * Vendored from cc-safety-net (MIT License)
 * Original author: kenryu42 (J Liew)
 * Source: https://github.com/kenryu42/claude-code-safety-net
 *
 * Modifications for pi-safety-net:
 *   - Replaced @/ path aliases with relative imports
 *   - Worktree mode enabled by default (see analyze.ts)
 */

type RedactFn = (text: string) => string;

export interface FormatBlockedMessageInput {
  reason: string;
  command?: string;
  segment?: string;
  maxLen?: number;
  redact?: RedactFn;
}

export function formatBlockedMessage(input: FormatBlockedMessageInput): string {
  const { reason, command, segment } = input;
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((t: string) => t);

  let message = `BLOCKED by Safety Net\n\nReason: ${reason}`;

  if (command) {
    const safeCommand = redact(command);
    message += `\n\nCommand: ${excerpt(safeCommand, maxLen)}`;
  }

  if (segment && segment !== command) {
    const safeSegment = redact(segment);
    message += `\n\nSegment: ${excerpt(safeSegment, maxLen)}`;
  }

  message +=
    '\n\nIf this operation is truly needed, ask the user for explicit permission and have them run the command manually.';

  return message;
}

function excerpt(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

# pi-safety-net

A global pi extension that intercepts every Bash tool call before execution, semantically analyzes the command, and presents a confirmation dialog when a dangerous pattern is detected.

## Features

- Blocks destructive `git` commands (`reset --hard`, `push --force`, etc.) before execution
- Blocks dangerous `rm -rf` patterns (protects `/`, `~`, `$HOME`)
- Detects shell-wrapper recursion (`bash -c '...'`) and interpreter one-liners
- Allow once, allow for session, or allow and remember (persisted allowlist)
- Worktree mode on by default — normal git workflow inside worktrees is not disrupted
- Custom block rules via `.pi-safety-net.json` (project) and `~/.pi/agent/safety-net/config.json` (user)
- Persistent allowlist at `~/.pi/agent/safety-net/allows.json` (global) and `<cwd>/.pi/safety-net-allows.json` (project)
- Audit logging to `~/.pi/agent/safety-net/logs/<session-id>.jsonl`
- `/safety-net:explain` and `/safety-net:allow` slash commands

## Install

```bash
pi install ~/repos/pi-safety-net
```

## Usage

Once installed, the extension is active globally in every pi session. No per-project setup required.

When a dangerous command is detected, you'll see a dialog with four options:

1. **Deny** (default) — block the command
2. **Allow Once** — allow this single execution
3. **Allow for Session** — allow for the remainder of this pi session
4. **Allow and Remember** — persist to allowlist; never prompted again for this pattern

## Vendored Analysis Engine

The command analysis engine (`extensions/src/core/`) is vendored from the
[cc-safety-net](https://github.com/kenryu42/claude-code-safety-net) project
by kenryu42, used under the MIT License.

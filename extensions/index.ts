import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * pi-safety-net extension
 *
 * Intercepts Bash tool calls before execution, analyzes commands for dangerous
 * patterns, and presents a confirmation dialog to the user.
 *
 * Vendored analysis engine derived from cc-safety-net (MIT, kenryu42):
 * https://github.com/kenryu42/claude-code-safety-net
 */
export default function (_pi: ExtensionAPI) {
  // Stub: extension registers no events yet.
  // Analysis engine wiring is implemented in subsequent waves.
}

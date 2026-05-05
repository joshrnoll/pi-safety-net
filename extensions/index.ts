import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handleToolCall } from "./hook.js";

/**
 * pi-safety-net extension
 *
 * Intercepts Bash tool calls before execution, analyzes commands for dangerous
 * patterns, and presents a confirmation dialog to the user.
 *
 * Vendored analysis engine derived from cc-safety-net (MIT, kenryu42):
 * https://github.com/kenryu42/claude-code-safety-net
 */
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => handleToolCall(event, ctx.cwd));
}

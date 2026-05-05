import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handleToolCallWithDialog } from "./dialog.js";
import { buildStatusText } from "./status.js";

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
  // Session-level allowlist: cleared when the extension runtime is torn down.
  const sessionMap = new Map<string, true>();

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("pi-safety-net", buildStatusText());
  });

  pi.on("session_shutdown", () => {
    sessionMap.clear();
  });

  pi.on("tool_call", (event, ctx) =>
    handleToolCallWithDialog(event, ctx, sessionMap)
  );
}

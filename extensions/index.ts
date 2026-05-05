import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handleToolCallWithDialog } from "./dialog.js";
import { buildStatusText } from "./status.js";
import { loadConfig } from "./src/core/config.js";
import type { Config } from "./src/types.js";

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

  // Custom block rules config: loaded once at session_start and cached.
  let sessionConfig: Config | undefined;

  // Session ID for audit logging: derived from ctx.sessionManager.getSessionFile()
  let sessionId: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("pi-safety-net", buildStatusText());
    // Load and cache custom block rules for this session's cwd.
    sessionConfig = loadConfig(ctx.cwd);
    // Derive session ID for audit log filenames.
    const sessionFile = ctx.sessionManager?.getSessionFile?.();
    sessionId = sessionFile ?? `session-${Date.now()}`;
  });

  pi.on("session_shutdown", () => {
    sessionMap.clear();
    sessionConfig = undefined;
    sessionId = undefined;
  });

  pi.on("tool_call", (event, ctx) =>
    handleToolCallWithDialog(event, ctx, sessionMap, sessionConfig, sessionId)
  );
}

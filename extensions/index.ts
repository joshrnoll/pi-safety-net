import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handleToolCallWithDialog } from "./dialog.js";
import { buildStatusText } from "./status.js";
import { loadAllowlist } from "./src/allowlist.js";
import type { AllowEntry } from "./src/allowlist.js";
import { handleAllowList, handleAllowRemove } from "./src/allow-commands.js";

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

  // Persistent allowlist cache: loaded fresh on each session_start so that
  // /new and /resume picks up any changes written between sessions.
  let allowlistCache: AllowEntry[] = [];

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("pi-safety-net", buildStatusText());
    // Reload the persistent allowlist from disk on every session start.
    allowlistCache = loadAllowlist(ctx.cwd);
  });

  pi.on("session_shutdown", () => {
    sessionMap.clear();
    allowlistCache = [];
  });

  pi.on("tool_call", (event, ctx) =>
    handleToolCallWithDialog(event, ctx, sessionMap, allowlistCache)
  );

  // /safety-net:allow list | remove
  pi.registerCommand("safety-net:allow", {
    description: "List or remove entries from the persistent allowlist",
    handler: async (args, ctx) => {
      const sub = (args ?? "").trim().toLowerCase();
      if (sub === "remove") {
        await handleAllowRemove(ctx, sessionMap, allowlistCache);
      } else {
        // Default to 'list' when arg is 'list' or empty
        await handleAllowList(ctx);
      }
    },
  });
}

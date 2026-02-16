/**
 * Push notification hook — sends push on agent_end.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getPluginConfig } from "./config.js";
import { sendPush, loadTokens } from "./push.js";

export function registerPushHook(api: OpenClawPluginApi) {
  try {
    api.on("agent_end", async (event, ctx) => {
      const tokens = loadTokens();
      if (tokens.length === 0) return;

      const msgs = event.messages ?? [];

      // Extract last assistant message - try string and array content formats
      let preview = "";
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i] as any;
        if (m.role === "assistant") {
          if (typeof m.content === "string" && m.content.trim()) {
            preview = m.content.slice(0, 200);
            break;
          }
          if (Array.isArray(m.content)) {
            const textBlock = m.content.find(
              (b: any) => b.type === "text" && typeof b.text === "string",
            );
            if (textBlock) {
              preview = textBlock.text.slice(0, 200);
              break;
            }
          }
        }
      }

      if (!preview) return;

      const freshConfig = getPluginConfig(api);

      // Resolve display name from gateway config agent list
      const agentId = ctx.agentId ?? "agent";
      const agents = (api.config as any)?.agents?.list ?? [];
      const agent = agents.find((a: any) => a.id === agentId);
      const displayName = agent?.name ?? agent?.identity?.name ?? agentId;

      for (const device of tokens) {
        if (!device.sendKey) continue;
        try {
          await sendPush(
            device.deviceId,
            {
              title: displayName,
              body: preview,
              data: { sessionKey: ctx.sessionKey, agentId },
            },
            freshConfig,
          );
        } catch (err) {
          api.logger.warn(
            `[aight-utils] Push failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });

    api.logger.info("[aight-utils] Push hook registered (agent_end)");
  } catch (err) {
    api.logger.error(
      `[aight-utils] Failed to register push hook: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

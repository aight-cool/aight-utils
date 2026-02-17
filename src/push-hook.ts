/**
 * Push notification hook — sends push on agent_end.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getPluginConfig } from "./config.js";
import { sendPush, loadTokens } from "./push.js";
import { loadGroupName } from "./groups.js";

export function registerPushHook(api: OpenClawPluginApi) {
  try {
    api.on("agent_end", async (event, ctx) => {
      api.logger.info(
        `[aight-utils] agent_end fired session=${ctx.sessionKey} agent=${ctx.agentId}`,
      );
      const tokens = loadTokens();
      if (tokens.length === 0) return;

      const msgs = event.messages ?? [];
      api.logger.info(
        `[aight-utils] messages count=${msgs.length} roles=${msgs.map((m: any) => m.role).join(",")}`,
      );

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

      if (!preview) {
        api.logger.info(`[aight-utils] No preview found, skipping push`);
        return;
      }

      // Skip internal/meta responses
      const skip = ["NO_REPLY", "REPLY_SKIP", "ANNOUNCE_SKIP", "HEARTBEAT_OK"];
      if (skip.includes(preview.trim())) {
        api.logger.info(`[aight-utils] Skipping meta response: ${preview.trim()}`);
        return;
      }

      const freshConfig = getPluginConfig(api);

      // Resolve display name from gateway config agent list
      const agentId = ctx.agentId ?? "agent";
      const agents = (api.config as any)?.agents?.list ?? [];
      const agent = agents.find((a: any) => a.id === agentId);
      const displayName = agent?.name ?? agent?.identity?.name ?? agentId;

      // Resolve group chat name for push title
      let pushTitle = displayName;
      const sessionKey = ctx.sessionKey ?? "";
      if (sessionKey.includes(":group-chat:")) {
        const groupId = sessionKey.split(":group-chat:")[1];
        if (groupId) {
          // Look up friendly name from plugin data store
          const groupName = loadGroupName(api, groupId);
          api.logger.info(
            `[aight-utils] Group push title: groupId=${groupId} groupName=${groupName ?? "(not found)"} pushTitle=${groupName ? `${displayName} — ${groupName}` : displayName}`,
          );
          pushTitle = groupName
            ? `${displayName} — ${groupName}`
            : displayName;
        }
      }

      for (const device of tokens) {
        if (!device.sendKey) continue;
        try {
          await sendPush(
            device.deviceId,
            {
              title: pushTitle.trim(),
              body: preview.trim(),
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

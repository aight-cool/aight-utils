/**
 * Push notification hook — sends push on agent_end.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getPluginConfig } from "./config.js";
import { sendPush, loadTokens, unregisterToken } from "./push.js";
import { loadGroupName } from "./groups.js";
import { shouldSendPush } from "./notif-prefs.js";

export function registerPushHook(api: OpenClawPluginApi) {
  try {
    api.on("agent_end", async (event, ctx) => {
      api.logger.info(
        `[aight-utils] agent_end fired session=${ctx.sessionKey} agent=${ctx.agentId}`,
      );
      const tokens = loadTokens();
      if (tokens.length === 0) return;

      // Skip hidden/internal sessions — no push notifications for config,
      // security, voice, sub-agent, or other background sessions.
      const sk = ctx.sessionKey ?? "";
      if (
        sk.endsWith(":aight-config") ||
        sk.endsWith(":aight-pentest") ||
        sk.endsWith(":speak") ||
        sk.endsWith(":structured_content") ||
        sk.endsWith(":main") ||
        sk.includes("subagent") ||
        sk.includes("security-audit") ||
        sk.includes("_skill-audit-") ||
        sk.includes("_ensure-skill-defender") ||
        sk.endsWith("security-fix") ||
        sk.endsWith("skill-scan")
      ) {
        api.logger.info(`[aight-utils] Skipping hidden session push: ${sk}`);
        return;
      }

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

      // Skip hidden/internal sessions (aight-config, structured_content, etc.)
      const sessionKey_ = ctx.sessionKey ?? "";
      const HIDDEN_SESSIONS = ["aight-config", "structured_content"];
      if (HIDDEN_SESSIONS.some((h) => sessionKey_.includes(h))) {
        api.logger.info(`[aight-utils] Skipping hidden session: ${sessionKey_}`);
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

      // Resolve group chat name for push subtitle (WhatsApp-style layout)
      const pushTitle = displayName;
      let pushSubtitle: string | undefined;
      const sessionKey = ctx.sessionKey ?? "";
      if (sessionKey.includes(":group-chat:")) {
        const groupId = sessionKey.split(":group-chat:")[1];
        if (groupId) {
          const groupName = loadGroupName(api, groupId);
          if (groupName) {
            pushSubtitle = groupName;
          }
        }
      }

      const cleanBody = preview.trim().replace(/\n+/g, " ").trim();

      // ── Notification preference gate ──
      // Check if this category is muted — if so, don't send the push at all.
      const sk_ = ctx.sessionKey ?? "";
      if (!shouldSendPush(sk_)) {
        api.logger.info(`[aight-utils] Push suppressed by notification prefs: ${sk_}`);
        return;
      }

      for (const device of tokens) {
        if (!device.sendKey) continue;
        try {
          const pushResult = await sendPush(
            device.deviceId,
            {
              title: pushTitle.trim(),
              subtitle: pushSubtitle,
              body: cleanBody,
              data: { sessionKey: ctx.sessionKey, agentId },
            },
            freshConfig,
          );
          api.logger.info(
            `[aight-utils] Push sent: session=${ctx.sessionKey} device=${device.deviceId} ok=${pushResult.ok}${pushResult.error ? ` error=${pushResult.error}` : ""}`,
          );

          // Auto-prune stale tokens — if the relay rejects the token, remove it
          if (!pushResult.ok && pushResult.error) {
            const err = pushResult.error.toLowerCase();
            if (
              err.includes("baddevicetoken") ||
              err.includes("unregistered") ||
              err.includes("devicetokennotfortopic") ||
              err.includes("expired")
            ) {
              api.logger.info(
                `[aight-utils] Pruning stale device token: ${device.deviceId}`,
              );
              unregisterToken(device.deviceId);
            }
          }
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

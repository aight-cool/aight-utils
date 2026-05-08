/**
 * Push notification hook — sends push on agent_end.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getPluginConfig } from "./config.js";
import { loadTokens, unregisterToken } from "./push-store.js";
import { sendPush } from "./push-net.js";
import { loadGroupName } from "./groups.js";
import { shouldSendPush } from "./notif-prefs.js";

const HIDDEN_SUFFIXES = [
  ":aight-config",
  ":aight-pentest",
  ":speak",
  ":structured_content",
  ":main",
  "security-fix",
  "skill-scan",
];
const HIDDEN_SUBSTRINGS = ["subagent", "security-audit", "_skill-audit-", "_ensure-skill-defender"];

const META_RESPONSES = ["NO_REPLY", "REPLY_SKIP", "ANNOUNCE_SKIP", "HEARTBEAT_OK"];
const STALE_TOKEN_ERRORS = ["baddevicetoken", "unregistered", "devicetokennotfortopic", "expired"];

export function registerPushHook(api: OpenClawPluginApi) {
  try {
    api.on("agent_end", async (event, ctx) => {
      const sessionKey = ctx.sessionKey ?? "";
      api.logger.info(`[aight-utils] agent_end fired session=${sessionKey} agent=${ctx.agentId}`);
      const tokens = loadTokens();
      if (tokens.length === 0) return;

      // Skip hidden/internal sessions — no push notifications for config,
      // security, voice, sub-agent, or other background sessions.
      if (
        HIDDEN_SUFFIXES.some((s) => sessionKey.endsWith(s)) ||
        HIDDEN_SUBSTRINGS.some((s) => sessionKey.includes(s))
      ) {
        api.logger.info(`[aight-utils] Skipping hidden session push: ${sessionKey}`);
        return;
      }

      // Notification preference gate — bail before expensive preview extraction
      if (!shouldSendPush(sessionKey)) {
        api.logger.info(`[aight-utils] Push suppressed by notification prefs: ${sessionKey}`);
        return;
      }

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

      if (!preview) {
        api.logger.info(`[aight-utils] No preview found, skipping push`);
        return;
      }

      if (META_RESPONSES.includes(preview.trim())) {
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
      let pushSubtitle: string | undefined;
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

      const pushPayload = {
        title: displayName.trim(),
        subtitle: pushSubtitle,
        body: cleanBody,
        data: { sessionKey, agentId },
      };

      for (const device of tokens) {
        if (!device.sendKey) continue;
        try {
          const pushResult = await sendPush(device, pushPayload, freshConfig);
          api.logger.info(
            `[aight-utils] Push sent: session=${sessionKey} device=${device.deviceId} ok=${pushResult.ok}${pushResult.error ? ` error=${pushResult.error}` : ""}`,
          );

          // Auto-prune stale tokens — if the relay rejects the token, remove it
          if (!pushResult.ok && pushResult.error) {
            const errLower = pushResult.error.toLowerCase();
            if (STALE_TOKEN_ERRORS.some((e) => errLower.includes(e))) {
              api.logger.info(`[aight-utils] Pruning stale device token: ${device.deviceId}`);
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
  } catch (err) {
    api.logger.error(
      `[aight-utils] Failed to register push hook: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

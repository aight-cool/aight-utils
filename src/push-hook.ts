/**
 * Push notification hook — fires push on agent_end when no app client is connected.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AightConfig } from "./config.js";
import { sendPush, loadTokens } from "./push.js";

export function registerPushHook(api: OpenClawPluginApi, config: AightConfig) {
  api.on("agent_end", async (event, ctx) => {
    const tokens = loadTokens();
    if (tokens.length === 0) return;

    // Extract last assistant message from the agent turn
    const lastMessage = event.messages
      ?.slice()
      .reverse()
      .find(
        (m: any) => m.role === "assistant" && typeof m.content === "string" && m.content.trim(),
      ) as { content: string } | undefined;

    if (!lastMessage) return;

    const agentId = ctx.agentId ?? "agent";
    const preview = lastMessage.content.slice(0, 200);

    // Send push to all registered devices
    for (const device of tokens) {
      if (!device.sendKey) continue;

      try {
        await sendPush(
          device.deviceId,
          {
            title: agentId,
            body: preview,
            data: {
              sessionKey: ctx.sessionKey,
              agentId,
            },
          },
          config,
        );
      } catch (err) {
        api.logger.warn(
          `[aight-utils] Push to ${device.deviceId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });

  api.logger.info("[aight-utils] Push hook registered (agent_end)");
}

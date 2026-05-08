/**
 * Push Notifications — aight.push.register, aight.push.unregister, aight.push.test
 *
 * Auth model: the relay has a master secret. During device registration, the
 * plugin calls relay /register with the device push token. The relay returns
 * a sendKey = HMAC(masterSecret, pushToken). The plugin stores the sendKey
 * alongside the device token. When sending a push, the plugin includes the
 * sendKey. The relay recomputes the HMAC and verifies — zero state, no shared secrets.
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { AightConfig } from "./config.js";
import { ensurePushHookEnabled } from "./config.js";
import { DEFAULT_RELAY_URL } from "./defaults.js";
import { loadTokens, registerToken, unregisterToken } from "./push-store.js";
import { obtainSendKey, sendPush } from "./push-net.js";

// Re-export for consumers
export { loadTokens, saveTokens, registerToken, unregisterToken } from "./push-store.js";
export { sendPush, obtainSendKey } from "./push-net.js";
export type { DeviceToken } from "./push-store.js";
export type { PushPayload } from "./push-net.js";

// ── Registration ──

export function registerPush(api: OpenClawPluginApi, _config: AightConfig) {
  api.registerGatewayMethod(
    "aight.push.register",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      if (
        !params ||
        typeof params !== "object" ||
        typeof params.deviceId !== "string" ||
        typeof params.pushToken !== "string" ||
        (params.platform !== "ios" && params.platform !== "android")
      ) {
        respond(false, { error: "deviceId, pushToken, and platform (ios|android) required" });
        return;
      }

      const deviceId = params.deviceId as string;
      const pushToken = params.pushToken as string;
      const platform = params.platform as "ios" | "android";
      const sandbox = !!params.sandbox;

      // Register immediately (respond fast)
      registerToken({
        deviceId,
        pushToken,
        platform,
        sandbox,
        registeredAt: new Date().toISOString(),
      });

      respond(true, { ok: true, deviceId });
      api.logger.info(`[aight-utils] Push token registered for device ${deviceId}`);

      // The user explicitly opted into notifications — enable conversation
      // access so the agent_end hook can build push previews. Required by
      // openclaw 2026.5.x for non-bundled plugins.
      ensurePushHookEnabled(api).catch(() => {
        /* errors already logged inside the helper */
      });

      // Obtain sendKey from relay in background
      const relayUrl = _config.push?.relayUrl ?? DEFAULT_RELAY_URL;
      obtainSendKey(relayUrl, pushToken)
        .then((sendKey) => {
          // Update the token with the sendKey
          registerToken({
            deviceId,
            pushToken,
            platform,
            sandbox,
            sendKey,
            registeredAt: new Date().toISOString(),
          });
          api.logger.info(`[aight-utils] sendKey obtained for device ${deviceId}`);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          api.logger.warn(`[aight-utils] Failed to obtain sendKey: ${msg}`);
        });
    },
  );

  api.registerGatewayMethod(
    "aight.push.unregister",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      const deviceId = typeof params?.deviceId === "string" ? params.deviceId : "";
      if (!deviceId) {
        respond(false, { error: "deviceId required" });
        return;
      }

      const ok = unregisterToken(deviceId);
      respond(true, { ok, deviceId });
    },
  );

  api.registerGatewayMethod(
    "aight.push.test",
    async ({ params, respond }: GatewayRequestHandlerOptions) => {
      const deviceId = typeof params?.deviceId === "string" ? params.deviceId : "";
      const tokens = loadTokens();
      const device = deviceId ? tokens.find((t) => t.deviceId === deviceId) : tokens[0];
      if (!device) {
        respond(false, { error: "No registered device" });
        return;
      }

      // Test always sends a visible push regardless of privacy mode
      const result = await sendPush(
        device,
        {
          title: "Aight 🤙",
          body: "Push notifications are working!",
        },
        { ..._config, push: { ..._config.push, mode: "rich" } },
      );

      respond(true, result);
    },
  );
}

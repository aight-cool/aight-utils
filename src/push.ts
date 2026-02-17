/**
 * Push Notifications — aight.push.register, aight.push.unregister, sendPush()
 *
 * Auth model: the relay has a master secret. During device registration, the
 * plugin calls relay /register with the device push token. The relay returns
 * a sendKey = HMAC(masterSecret, pushToken). The plugin stores the sendKey
 * alongside the device token. When sending a push, the plugin includes the
 * sendKey. The relay recomputes the HMAC and verifies — zero state, no shared secrets.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { AightConfig } from "./config.js";
import { DEFAULT_RELAY_URL, DEFAULT_PUSH_MODE } from "./defaults.js";

// ── Device Token Store ──

export interface DeviceToken {
  deviceId: string;
  pushToken: string;
  platform: "ios" | "android";
  sandbox?: boolean;
  sendKey?: string;
  registeredAt: string;
}

const TOKEN_DIR = path.join(os.homedir(), ".openclaw", "aight");
const TOKEN_FILE = path.join(TOKEN_DIR, "devices.json");

export function loadTokens(): DeviceToken[] {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return [];
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTokens(tokens: DeviceToken[]): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export function registerToken(token: DeviceToken): void {
  const tokens = loadTokens();
  const idx = tokens.findIndex((t) => t.deviceId === token.deviceId);
  if (idx >= 0) {
    tokens[idx] = token;
  } else {
    tokens.push(token);
  }
  saveTokens(tokens);
}

export function unregisterToken(deviceId: string): boolean {
  const tokens = loadTokens();
  const filtered = tokens.filter((t) => t.deviceId !== deviceId);
  if (filtered.length === tokens.length) return false;
  saveTokens(filtered);
  return true;
}

// ── Relay Registration (get sendKey) ──

async function obtainSendKey(relayUrl: string, pushToken: string): Promise<string> {
  const res = await fetch(`${relayUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: pushToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Relay /register returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { ok: boolean; sendKey: string };
  if (!data.sendKey) throw new Error("Relay did not return a sendKey");
  return data.sendKey;
}

// ── Push Sending ──

export interface PushPayload {
  title?: string;
  subtitle?: string;
  body?: string;
  data?: Record<string, unknown>;
  silent?: boolean;
}

export async function sendPush(
  deviceId: string,
  payload: PushPayload,
  config: AightConfig,
): Promise<{ ok: boolean; error?: string }> {
  const tokens = loadTokens();
  const device = tokens.find((t) => t.deviceId === deviceId);
  if (!device) {
    return { ok: false, error: `No device token for ${deviceId}` };
  }
  if (!device.sendKey) {
    return { ok: false, error: `No sendKey for device ${deviceId} — re-register to obtain one` };
  }

  const relayUrl = config.push?.relayUrl ?? DEFAULT_RELAY_URL;
  const mode = config.push?.mode ?? DEFAULT_PUSH_MODE;

  const pushBody: Record<string, unknown> = {
    token: device.pushToken,
    sendKey: device.sendKey,
    platform: device.platform,
    sandbox: device.sandbox ?? false,
  };

  if (mode === "rich" && !payload.silent) {
    pushBody.title = payload.title;
    if (payload.subtitle) pushBody.subtitle = payload.subtitle;
    pushBody.body = payload.body;
  }

  if (payload.data) {
    pushBody.data = payload.data;
  }

  try {
    const res = await fetch(`${relayUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pushBody),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Relay returned ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

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
        device.deviceId,
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

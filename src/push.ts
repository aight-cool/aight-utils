/**
 * Push Notifications — aight.push.register, aight.push.unregister, sendPush()
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { AightConfig } from "./config.js";

// ── Device Token Store ──

export interface DeviceToken {
  deviceId: string;
  pushToken: string;
  platform: "ios" | "android";
  sandbox?: boolean;
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
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
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

// ── Push Sending ──

export interface PushPayload {
  title?: string;
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

  const relayUrl = config.push?.relayUrl ?? "https://push-relay.brunobar79.workers.dev";
  const relaySecret = config.push?.relaySecret;
  const mode = config.push?.mode ?? "private";

  const pushBody: Record<string, unknown> = {
    token: device.pushToken,
    platform: device.platform,
    sandbox: device.sandbox ?? false,
    silent: mode === "private" || !!payload.silent,
  };

  if (mode === "rich" && !payload.silent) {
    pushBody.title = payload.title;
    pushBody.body = payload.body;
  }

  if (payload.data) {
    pushBody.data = payload.data;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (relaySecret) {
      headers["Authorization"] = `Bearer ${relaySecret}`;
    }

    const res = await fetch(`${relayUrl}/send`, {
      method: "POST",
      headers,
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

      registerToken({
        deviceId: params.deviceId,
        pushToken: params.pushToken,
        platform: params.platform,
        sandbox: !!params.sandbox,
        registeredAt: new Date().toISOString(),
      });

      api.logger.info(`[aight-utils] Push token registered for device ${params.deviceId}`);
      respond(true, { ok: true, deviceId: params.deviceId });
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
}

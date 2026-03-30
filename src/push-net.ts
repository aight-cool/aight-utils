/**
 * Push relay network calls — fetch only, no filesystem access.
 */

import type { DeviceToken } from "./push-store.js";
import type { AightConfig } from "./config.js";
import { DEFAULT_RELAY_URL, DEFAULT_PUSH_MODE } from "./defaults.js";

// ── Relay Registration (get sendKey) ──

export async function obtainSendKey(relayUrl: string, pushToken: string): Promise<string> {
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
  device: DeviceToken,
  payload: PushPayload,
  config: AightConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!device.sendKey) {
    return {
      ok: false,
      error: `No sendKey for device ${device.deviceId} — re-register to obtain one`,
    };
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

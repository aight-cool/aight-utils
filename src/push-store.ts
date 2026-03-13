/**
 * Push device token persistence — file-based storage only, no network.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Device Token Types ──

export interface DeviceToken {
  deviceId: string;
  pushToken: string;
  platform: "ios" | "android";
  sandbox?: boolean;
  sendKey?: string;
  registeredAt: string;
}

// ── Store ──

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

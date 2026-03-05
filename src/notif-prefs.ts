/**
 * Notification Preferences — gateway-side storage for push suppression.
 *
 * The app syncs notification preferences here via RPC. The push hook
 * checks these prefs before sending to the relay — if a category is
 * muted, the push never leaves the user's machine.
 *
 * RPC methods:
 *   aight.notif.setPrefs  — update preferences
 *   aight.notif.getPrefs  — read current preferences
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

// ── Types ──

export interface NotifPrefs {
  globalMute: boolean;
  muteUntil: string | null;
  agentReplies: boolean;
  groupChat: boolean;
  cron: boolean;
}

const DEFAULTS: NotifPrefs = {
  globalMute: false,
  muteUntil: null,
  agentReplies: true,
  groupChat: true,
  cron: false,
};

// ── Storage ──

const PREFS_DIR = path.join(os.homedir(), ".openclaw", "aight");
const PREFS_FILE = path.join(PREFS_DIR, "notif-prefs.json");

export function loadNotifPrefs(): NotifPrefs {
  try {
    if (!fs.existsSync(PREFS_FILE)) return { ...DEFAULTS };
    const raw = fs.readFileSync(PREFS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveNotifPrefs(prefs: NotifPrefs): void {
  fs.mkdirSync(PREFS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), "utf-8");
}

// ── Classification (matches app-side logic) ──

export function classifySessionKey(sessionKey: string): "agentReplies" | "groupChat" | "cron" {
  if (sessionKey.includes(":cron:")) return "cron";
  if (sessionKey.includes(":group-chat:")) return "groupChat";
  return "agentReplies";
}

/**
 * Check if a push for this sessionKey should be sent.
 */
export function shouldSendPush(sessionKey: string): boolean {
  if (!sessionKey) return true; // fail open

  const prefs = loadNotifPrefs();

  // Global mute
  if (prefs.globalMute) {
    if (!prefs.muteUntil) return false; // indefinite
    const expiry = new Date(prefs.muteUntil).getTime();
    if (Date.now() < expiry) return false;
    // Mute expired — clear it
    prefs.globalMute = false;
    prefs.muteUntil = null;
    saveNotifPrefs(prefs);
  }

  // Category check
  const category = classifySessionKey(sessionKey);
  return prefs[category];
}

// ── RPC Registration ──

export function registerNotifPrefsRPC(api: OpenClawPluginApi) {
  api.registerGatewayMethod("aight.notif.getPrefs", ({ respond }: GatewayRequestHandlerOptions) => {
    respond(true, loadNotifPrefs());
  });

  api.registerGatewayMethod(
    "aight.notif.setPrefs",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      const update = (params ?? {}) as Partial<NotifPrefs>;
      const current = loadNotifPrefs();

      if (typeof update.globalMute === "boolean") current.globalMute = update.globalMute;
      if (typeof update.agentReplies === "boolean") current.agentReplies = update.agentReplies;
      if (typeof update.groupChat === "boolean") current.groupChat = update.groupChat;
      if (typeof update.cron === "boolean") current.cron = update.cron;
      if (update.muteUntil !== undefined) current.muteUntil = update.muteUntil;

      saveNotifPrefs(current);
      api.logger.info(`[aight-utils] Notification prefs updated: ${JSON.stringify(current)}`);
      respond(true, current);
    },
  );

  api.logger.info("[aight-utils] Notification prefs RPC registered");
}

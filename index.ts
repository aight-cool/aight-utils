/**
 * @aight/utils — OpenClaw gateway plugin
 *
 * Push notifications, Today items, config RPC, and agent bootstrap for the Aight app.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerConfig, getPluginConfig } from "./src/config.js";
import { registerItems } from "./src/items.js";
import { registerPush } from "./src/push.js";
import { registerReminders } from "./src/reminders.js";
import { registerBootstrap } from "./src/bootstrap.js";
import { registerPushHook } from "./src/push-hook.js";
import { registerHealth } from "./src/health.js";
import { registerVersion } from "./src/version.js";
import { registerGroupRpc } from "./src/groups.js";
import { registerNotifPrefsRPC } from "./src/notif-prefs.js";

export default definePluginEntry({
  id: "aight-utils",
  name: "Aight Utilities",
  description: "Push notifications, Today items, config RPC, and agent bootstrap for the Aight app",

  // UI labels/placeholders live in openclaw.plugin.json's top-level `uiHints`;
  // the host no longer reads uiHints from the runtime configSchema.
  configSchema: {
    parse(value: unknown) {
      const raw =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return {
        push: {
          mode: (raw.push as any)?.mode ?? "private",
          relayUrl: (raw.push as any)?.relayUrl ?? "https://push.aight.app",
          relaySecret: (raw.push as any)?.relaySecret,
        },
        today: {
          enabled: (raw.today as any)?.enabled ?? true,
        },
      };
    },
  },

  register(api: OpenClawPluginApi) {
    const cfg = getPluginConfig(api);

    registerConfig(api);
    registerItems(api);
    registerPush(api, cfg);
    registerReminders(api, cfg);
    registerBootstrap(api);
    registerPushHook(api);
    registerHealth(api);
    registerVersion(api);
    registerGroupRpc(api);
    registerNotifPrefsRPC(api);
  },
});

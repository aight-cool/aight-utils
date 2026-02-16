/**
 * @aight/utils — OpenClaw gateway plugin
 *
 * Push notifications, Today items, config RPC, and agent bootstrap for the Aight app.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerConfig, getPluginConfig } from "./src/config.js";
import { registerItems } from "./src/items.js";
import { registerPush } from "./src/push.js";
import { registerReminders } from "./src/reminders.js";
import { registerBootstrap } from "./src/bootstrap.js";
import { registerPushHook } from "./src/push-hook.js";
import { registerHealth } from "./src/health.js";

const aightPlugin = {
  id: "aight-utils",
  name: "Aight Utilities",
  description: "Push notifications, Today items, config RPC, and agent bootstrap for the Aight app",

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
    uiHints: {
      "push.mode": {
        label: "Notification Mode",
        help: "Private = silent wake. Rich = preview text in notification.",
      },
      "push.relayUrl": {
        label: "Push Relay URL",
        placeholder: "https://push.aight.app",
      },
      "push.relaySecret": {
        label: "Relay Shared Secret",
        sensitive: true,
      },
      "today.enabled": {
        label: "Today View",
      },
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

    api.logger.info("[aight-utils] Plugin loaded");
  },
};

export default aightPlugin;

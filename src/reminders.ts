/**
 * Reminders Service — background service checking scheduled items every 30s
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AightConfig } from "./config.js";
import { loadItems, saveItems } from "./items.js";
import { sendPush, loadTokens } from "./push.js";

const CHECK_INTERVAL_MS = 30_000;

export function registerReminders(api: OpenClawPluginApi, config: AightConfig) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function checkReminders() {
    const now = Date.now();
    const items = loadItems();
    let changed = false;

    const dueItems = items.filter(
      (i) =>
        i.type === "trigger" &&
        i.status === "active" &&
        i.scheduledFor &&
        new Date(i.scheduledFor).getTime() <= now,
    );

    if (dueItems.length === 0) return;

    const tokens = loadTokens();

    for (const item of dueItems) {
      item.status = "fired";
      item.updatedAt = new Date().toISOString();
      changed = true;

      api.logger.info(`[aight-utils] Trigger fired: ${item.title} (${item.id})`);

      for (const device of tokens) {
        try {
          await sendPush(
            device.deviceId,
            {
              title: "Reminder",
              body: item.title,
              data: { itemId: item.id, type: "trigger" },
            },
            config,
          );
        } catch (err) {
          api.logger.error(
            `[aight-utils] Push failed for ${device.deviceId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    if (changed) {
      saveItems(items);
    }
  }

  api.registerService({
    id: "aight-reminders",
    start: () => {
      if (config.today?.enabled === false) {
        api.logger.info("[aight-utils] Today view disabled, skipping reminders service");
        return;
      }
      timer = setInterval(() => {
        checkReminders().catch((err) => {
          api.logger.error(
            `[aight-utils] Reminder check error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      }, CHECK_INTERVAL_MS);
      api.logger.info("[aight-utils] Reminders service started (30s interval)");
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      api.logger.info("[aight-utils] Reminders service stopped");
    },
  });
}

/**
 * Config RPC module — aight.config.get, aight.config.patch, aight.status
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

export interface AightConfig {
  push?: {
    mode?: "private" | "rich";
    relayUrl?: string;
    relaySecret?: string;
  };
  today?: {
    enabled?: boolean;
  };
}

/** Secret keys that must never be returned to clients via RPC */
const SECRET_KEYS: string[] = ["relaySecret"];

/** Returns a sanitized copy of the config with secrets redacted */
export function getClientSafeConfig(config: AightConfig): Record<string, unknown> {
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.push) {
    for (const key of SECRET_KEYS) {
      if (key in safe.push) {
        safe.push[key] = safe.push[key] ? "[REDACTED]" : undefined;
      }
    }
  }
  return safe;
}

export function getPluginConfig(api: OpenClawPluginApi): AightConfig {
  const raw = api.pluginConfig;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as AightConfig) : {};
}

export function registerConfig(api: OpenClawPluginApi) {
  api.registerGatewayMethod("aight.config.get", ({ respond }: GatewayRequestHandlerOptions) => {
    respond(true, getClientSafeConfig(getPluginConfig(api)));
  });

  api.registerGatewayMethod(
    "aight.config.patch",
    async ({ params, respond }: GatewayRequestHandlerOptions) => {
      if (!params || typeof params !== "object") {
        respond(false, { error: "params must be an object" });
        return;
      }
      try {
        // Load current config, merge patch into plugin config, write back
        const currentConfig = await api.runtime.config.loadConfig();
        const pluginEntry = (currentConfig as any)?.plugins?.entries?.["aight-utils"] ?? {};
        const currentPluginConfig = pluginEntry.config ?? {};

        // Deep merge the patch into plugin config
        const merged = { ...currentPluginConfig };
        for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
          if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            merged[key] &&
            typeof merged[key] === "object"
          ) {
            merged[key] = { ...merged[key], ...value };
          } else {
            merged[key] = value;
          }
        }

        // Write updated config
        const updatedConfig = {
          ...(currentConfig as Record<string, unknown>),
          plugins: {
            ...((currentConfig as any)?.plugins ?? {}),
            entries: {
              ...((currentConfig as any)?.plugins?.entries ?? {}),
              "aight-utils": {
                ...pluginEntry,
                config: merged,
              },
            },
          },
        };

        await api.runtime.config.writeConfigFile(updatedConfig as any);
        respond(true, { ok: true, config: getClientSafeConfig(merged as AightConfig) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`[aight-utils] config.patch failed: ${msg}`);
        respond(false, { error: msg });
      }
    },
  );

  api.registerGatewayMethod("aight.status", ({ respond }: GatewayRequestHandlerOptions) => {
    const cfg = getPluginConfig(api);
    respond(true, {
      ok: true,
      version: "0.1.0",
      push: {
        mode: cfg.push?.mode ?? "rich",
        relayUrl: cfg.push?.relayUrl ?? "https://push.aight.app",
      },
      today: {
        enabled: cfg.today?.enabled ?? true,
      },
    });
  });
}

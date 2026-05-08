/**
 * Config RPC module — aight.config.get, aight.config.patch, aight.status
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { DEFAULT_PUSH_MODE } from "./defaults.js";

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

/** Strict allowlist of keys this plugin owns — anything else is rejected */
const PLUGIN_CONFIG_KEYS = new Set(["push", "today"]);

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

/**
 * Read whether the agent_end push hook is allowed conversation access.
 * OpenClaw 2026.5.x blocks non-bundled plugin hooks from seeing message
 * payloads unless `plugins.entries.aight-utils.hooks.allowConversationAccess`
 * is explicitly true.
 */
export async function isPushHookEnabled(api: OpenClawPluginApi): Promise<boolean> {
  try {
    const currentConfig = (await api.runtime.config.loadConfig()) as any;
    return (
      currentConfig?.plugins?.entries?.["aight-utils"]?.hooks?.allowConversationAccess === true
    );
  } catch {
    return false;
  }
}

/**
 * Ensure `allowConversationAccess` is true so the agent_end hook can build
 * push previews from message content. Idempotent — only writes if unset.
 */
export async function ensurePushHookEnabled(api: OpenClawPluginApi): Promise<boolean> {
  try {
    const currentConfig = (await api.runtime.config.loadConfig()) as any;
    const pluginEntry = currentConfig?.plugins?.entries?.["aight-utils"] ?? {};
    if (pluginEntry.hooks?.allowConversationAccess === true) return true;

    await api.runtime.config.writeConfigFile({
      ...currentConfig,
      plugins: {
        ...currentConfig.plugins,
        entries: {
          ...currentConfig.plugins?.entries,
          "aight-utils": {
            ...pluginEntry,
            hooks: { ...pluginEntry.hooks, allowConversationAccess: true },
          },
        },
      },
    });
    api.logger.info("[aight-utils] Enabled hooks.allowConversationAccess for push hook");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    api.logger.warn(`[aight-utils] Failed to enable push hook conversation access: ${msg}`);
    return false;
  }
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
        // Reject any keys not in the plugin allowlist — never touch root gateway config
        const incoming = params as Record<string, unknown>;
        for (const key of Object.keys(incoming)) {
          if (!PLUGIN_CONFIG_KEYS.has(key)) {
            respond(false, { error: `Key "${key}" is not allowed in config.patch` });
            return;
          }
        }

        // Load current config
        const currentConfig = await api.runtime.config.loadConfig();
        const pluginEntry = (currentConfig as any)?.plugins?.entries?.["aight-utils"] ?? {};
        const currentPluginConfig = pluginEntry.config ?? {};

        // Deep merge allowed plugin-level keys into plugin config
        const merged = { ...currentPluginConfig };
        for (const [key, value] of Object.entries(incoming)) {
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

        // Build updated config — only the plugin's own config section is modified;
        // root gateway config is preserved as-is and never overwritten by client input.
        const updatedConfig: Record<string, unknown> = {
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

  api.registerGatewayMethod("aight.status", async ({ respond }: GatewayRequestHandlerOptions) => {
    const cfg = getPluginConfig(api);
    const pushHookActive = await isPushHookEnabled(api);
    respond(true, {
      ok: true,
      version: "0.1.0",
      push: {
        mode: cfg.push?.mode ?? DEFAULT_PUSH_MODE,
        relayUrl: cfg.push?.relayUrl ?? "https://push.aight.app",
      },
      pushHookActive,
      today: {
        enabled: cfg.today?.enabled ?? true,
      },
    });
  });
}

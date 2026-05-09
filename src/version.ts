/**
 * Version RPC — aight.version
 *
 * Returns current installed version and latest available on npm.
 * Uses Node built-ins only (no child_process).
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

/** Updated by scripts/release.sh — do not edit manually. */
const VERSION = "0.1.24";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const npmCache = new Map<string, { version: string; checkedAt: number }>();

async function getLatestNpmVersion(pkg: string): Promise<string> {
  const cached = npmCache.get(pkg);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.version;
  }
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unknown";
    const data = (await res.json()) as { version?: string };
    const version = data.version ?? "unknown";
    npmCache.set(pkg, { version, checkedAt: Date.now() });
    return version;
  } catch {
    return cached?.version ?? "unknown";
  }
}

export function registerVersion(api: OpenClawPluginApi) {
  api.registerGatewayMethod("aight.version", async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      const current = VERSION;
      const latest = await getLatestNpmVersion("@aight-cool/aight-utils");
      const gatewayLatest = await getLatestNpmVersion("openclaw");
      respond(true, {
        current,
        latest,
        updateAvailable: latest !== "unknown" && current !== latest,
        gatewayLatest,
      });
    } catch (err) {
      respond(false, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

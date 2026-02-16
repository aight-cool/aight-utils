/**
 * Version RPC — aight.version
 *
 * Returns current installed version and latest available on npm.
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let cachedVersion: string | null = null;
let cachedLatest: { version: string; checkedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCurrentVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf8"));
    cachedVersion = pkg.version ?? "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion!;
}

async function getLatestVersion(): Promise<string> {
  if (cachedLatest && Date.now() - cachedLatest.checkedAt < CACHE_TTL_MS) {
    return cachedLatest.version;
  }
  try {
    const res = await fetch("https://registry.npmjs.org/@aight-cool/aight-utils/latest", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unknown";
    const data = (await res.json()) as { version?: string };
    const version = data.version ?? "unknown";
    cachedLatest = { version, checkedAt: Date.now() };
    return version;
  } catch {
    return cachedLatest?.version ?? "unknown";
  }
}

export function registerVersion(api: OpenClawPluginApi) {
  api.registerGatewayMethod("aight.version", async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      const current = getCurrentVersion();
      const latest = await getLatestVersion();
      respond(true, {
        current,
        latest,
        updateAvailable: latest !== "unknown" && current !== latest,
      });
    } catch (err) {
      respond(false, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

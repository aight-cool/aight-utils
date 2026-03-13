/**
 * System health RPC — aight.health
 *
 * Returns memory, CPU, disk stats without needing an LLM call.
 * Uses Node built-ins only (no child_process).
 */

import * as os from "node:os";
import * as fs from "node:fs";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

interface HealthStats {
  memory: { usedGB: number; totalGB: number; percent: number } | null;
  cpu: { percent: number } | null;
  disk: { usedGB: number; totalGB: number; percent: number } | null;
}

function getStats(): HealthStats {
  let memory: HealthStats["memory"] = null;
  let cpu: HealthStats["cpu"] = null;
  let disk: HealthStats["disk"] = null;

  try {
    // Memory — os.totalmem / os.freemem (cross-platform)
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;
    const totalGB = totalBytes / 1073741824;
    const usedGB = usedBytes / 1073741824;
    memory = {
      usedGB: Math.round(usedGB * 10) / 10,
      totalGB: Math.round(totalGB * 10) / 10,
      percent: Math.round((usedGB / totalGB) * 100),
    };

    // CPU — load average relative to core count (cross-platform)
    const load1m = os.loadavg()[0];
    const cores = os.cpus().length;
    cpu = { percent: Math.round(Math.min((load1m / cores) * 100, 100)) };

    // Disk — fs.statfsSync (Node 18.15+)
    const stat = fs.statfsSync("/");
    const totalDiskBytes = stat.blocks * stat.bsize;
    const freeDiskBytes = stat.bfree * stat.bsize;
    const usedDiskBytes = totalDiskBytes - freeDiskBytes;
    disk = {
      totalGB: Math.round(totalDiskBytes / 1073741824),
      usedGB: Math.round(usedDiskBytes / 1073741824),
      percent: Math.round((usedDiskBytes / totalDiskBytes) * 100),
    };
  } catch {
    // Best effort — return whatever we got
  }

  return { memory, cpu, disk };
}

export function registerHealth(api: OpenClawPluginApi) {
  api.registerGatewayMethod("aight.health", async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      const stats = getStats();
      respond(true, stats);
    } catch (err) {
      respond(false, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

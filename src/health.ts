/**
 * System health RPC — aight.health
 *
 * Returns memory, CPU, disk stats without needing an LLM call.
 */

import { execSync } from "child_process";
import { platform } from "os";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

interface HealthStats {
  memory: { usedGB: number; totalGB: number; percent: number } | null;
  cpu: { percent: number } | null;
  disk: { usedGB: number; totalGB: number; percent: number } | null;
}

function getStats(): HealthStats {
  const os = platform();
  let memory: HealthStats["memory"] = null;
  let cpu: HealthStats["cpu"] = null;
  let disk: HealthStats["disk"] = null;

  try {
    if (os === "darwin") {
      // Memory
      const totalBytes = parseInt(
        execSync("/usr/sbin/sysctl -n hw.memsize", { encoding: "utf8", timeout: 5000 }).trim(),
      );
      const top = execSync("top -l 1 -n 0", { encoding: "utf8", timeout: 5000 });
      const memMatch = top.match(/PhysMem:\s*(\d+)([GM])\s*used/);
      const usedGB = memMatch ? parseInt(memMatch[1]) * (memMatch[2] === "G" ? 1 : 1 / 1024) : 0;
      const totalGB = totalBytes / 1073741824;
      memory = {
        usedGB: Math.round(usedGB * 10) / 10,
        totalGB: Math.round(totalGB * 10) / 10,
        percent: Math.round((usedGB / totalGB) * 100),
      };

      // CPU
      const idleMatch = top.match(/([\d.]+)% idle/);
      cpu = {
        percent: idleMatch ? Math.round(100 - parseFloat(idleMatch[1])) : 0,
      };
    } else {
      // Linux memory
      const meminfo = execSync("cat /proc/meminfo", { encoding: "utf8", timeout: 5000 });
      const totalKB = parseInt(meminfo.match(/MemTotal:\s*(\d+)/)?.[1] ?? "0");
      const availKB = parseInt(meminfo.match(/MemAvailable:\s*(\d+)/)?.[1] ?? "0");
      const totalGB = (totalKB * 1024) / 1073741824;
      const usedGB = ((totalKB - availKB) * 1024) / 1073741824;
      memory = {
        usedGB: Math.round(usedGB * 10) / 10,
        totalGB: Math.round(totalGB * 10) / 10,
        percent: Math.round((usedGB / totalGB) * 100),
      };

      // Linux CPU
      const loadavg = execSync("cat /proc/loadavg", { encoding: "utf8", timeout: 5000 });
      const load1m = parseFloat(loadavg.split(" ")[0]);
      const cores = parseInt(execSync("nproc", { encoding: "utf8", timeout: 5000 }).trim());
      cpu = { percent: Math.round(Math.min((load1m / cores) * 100, 100)) };
    }

    // Disk (cross-platform via df)
    const df = execSync("df -k /", { encoding: "utf8", timeout: 5000 });
    const dfLine = df.split("\n")[1];
    const dfParts = dfLine?.split(/\s+/);
    if (dfParts && dfParts.length >= 4) {
      const totalKB = parseInt(dfParts[1]);
      const usedKB = parseInt(dfParts[2]);
      disk = {
        totalGB: Math.round(totalKB / 1048576),
        usedGB: Math.round(usedKB / 1048576),
        percent: Math.round((usedKB / totalKB) * 100),
      };
    }
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

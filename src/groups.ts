/**
 * Group name store — simple mapping of groupId → display name.
 * The app registers group names via RPC so push notifications
 * can show friendly titles instead of raw IDs.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const FILENAME = "group-names.json";

function filePath(api: OpenClawPluginApi): string {
  const dir =
    (api as any).dataDir ??
    join(homedir(), ".openclaw", "plugin-data", "aight-utils");
  mkdirSync(dir, { recursive: true });
  return join(dir, FILENAME);
}

function loadAll(api: OpenClawPluginApi): Record<string, string> {
  try {
    return JSON.parse(readFileSync(filePath(api), "utf-8"));
  } catch {
    return {};
  }
}

function saveAll(api: OpenClawPluginApi, data: Record<string, string>): void {
  writeFileSync(filePath(api), JSON.stringify(data), "utf-8");
}

export function loadGroupName(api: OpenClawPluginApi, groupId: string): string | undefined {
  return loadAll(api)[groupId];
}

export function registerGroupName(api: OpenClawPluginApi, groupId: string, name: string): void {
  const data = loadAll(api);
  data[groupId] = name;
  saveAll(api, data);
}

export function removeGroupName(api: OpenClawPluginApi, groupId: string): void {
  const data = loadAll(api);
  delete data[groupId];
  saveAll(api, data);
}

export function registerGroupRpc(api: OpenClawPluginApi): void {
  api.registerGatewayMethod("aight.groups.setName", ({ params, respond }: any) => {
    const { groupId, name } = (params ?? {}) as { groupId?: string; name?: string };
    if (!groupId || !name) {
      respond(false, { error: "groupId and name are required" });
      return;
    }
    registerGroupName(api, groupId, name);
    respond(true, { ok: true });
  });

  api.registerGatewayMethod("aight.groups.removeName", ({ params, respond }: any) => {
    const { groupId } = (params ?? {}) as { groupId?: string };
    if (!groupId) {
      respond(false, { error: "groupId is required" });
      return;
    }
    removeGroupName(api, groupId);
    respond(true, { ok: true });
  });
}

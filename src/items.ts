/**
 * Items Store — aight.items.list, aight.items.upsert, aight.items.delete + aight_item tool
 */

import { Type, type Static } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

// ── Types ──

export const ItemType = Type.Union([
  Type.Literal("trigger"),
  Type.Literal("item"),
  Type.Literal("process"),
]);

export const ItemStatus = Type.Union([
  Type.Literal("active"),
  Type.Literal("done"),
  Type.Literal("fired"),
  Type.Literal("cancelled"),
  Type.Literal("deleted"),
]);

export const ItemSchema = Type.Object({
  id: Type.String({ description: "Unique item ID" }),
  type: ItemType,
  title: Type.String({ description: "Display title" }),
  status: Type.Optional(ItemStatus),
  labels: Type.Optional(Type.Array(Type.String())),
  scheduledFor: Type.Optional(Type.String({ description: "ISO 8601 datetime for triggers" })),
  description: Type.Optional(Type.String()),
  url: Type.Optional(Type.String({ description: "Related URL (PR, issue, etc.)" })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export type Item = Static<typeof ItemSchema>;

// ── Store ──

const STORE_DIR = path.join(os.homedir(), ".openclaw", "aight");
const STORE_FILE = path.join(STORE_DIR, "items.json");

export function loadItems(): Item[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveItems(items: Item[]): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(items, null, 2), { encoding: "utf-8", mode: 0o600 });
}

const MAX_TITLE_LEN = 500;
const MAX_DESC_LEN = 5000;
const MAX_ITEMS = 10000;

export function upsertItem(item: Item): Item {
  if (item.title && item.title.length > MAX_TITLE_LEN) {
    throw new Error(`title exceeds max length of ${MAX_TITLE_LEN}`);
  }
  if (item.description && item.description.length > MAX_DESC_LEN) {
    throw new Error(`description exceeds max length of ${MAX_DESC_LEN}`);
  }
  const items = loadItems();
  const now = new Date().toISOString();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx < 0 && items.length >= MAX_ITEMS) {
    throw new Error(`item store full (max ${MAX_ITEMS})`);
  }
  const merged: Item = {
    ...item,
    status: item.status ?? "active",
    updatedAt: now,
    createdAt: idx >= 0 ? items[idx].createdAt : now,
  };
  if (idx >= 0) {
    items[idx] = merged;
  } else {
    items.push(merged);
  }
  saveItems(items);
  return merged;
}

export function deleteItem(id: string): boolean {
  const items = loadItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  items[idx] = { ...items[idx], status: "deleted", updatedAt: new Date().toISOString() };
  saveItems(items);
  return true;
}

export interface ListFilters {
  type?: string;
  labels?: string[];
  status?: string;
  from?: string;
  to?: string;
}

export function listItems(filters: ListFilters = {}): Item[] {
  let items = loadItems().filter((i) => i.status !== "deleted");

  if (filters.type) {
    items = items.filter((i) => i.type === filters.type);
  }
  if (filters.status) {
    items = items.filter((i) => i.status === filters.status);
  }
  if (filters.labels && filters.labels.length > 0) {
    items = items.filter((i) =>
      filters.labels!.some((l) => i.labels?.includes(l)),
    );
  }
  if (filters.from) {
    const fromTs = new Date(filters.from).getTime();
    items = items.filter((i) => {
      if (!i.scheduledFor) return true;
      return new Date(i.scheduledFor).getTime() >= fromTs;
    });
  }
  if (filters.to) {
    const toTs = new Date(filters.to).getTime();
    items = items.filter((i) => {
      if (!i.scheduledFor) return true;
      return new Date(i.scheduledFor).getTime() <= toTs;
    });
  }

  return items;
}

// ── Tool schema ──

export const AightItemToolParams = Type.Object({
  action: Type.Union([Type.Literal("create"), Type.Literal("update"), Type.Literal("delete")]),
  item: Type.Optional(ItemSchema),
  id: Type.Optional(Type.String({ description: "Item ID (for delete)" })),
});

// ── Registration ──

export function registerItems(api: OpenClawPluginApi) {
  api.registerGatewayMethod(
    "aight.items.list",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      const filters: ListFilters = params && typeof params === "object" ? params as ListFilters : {};
      respond(true, { items: listItems(filters) });
    },
  );

  api.registerGatewayMethod(
    "aight.items.upsert",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      if (!params || typeof params !== "object" || !("id" in params) || !("type" in params) || !("title" in params)) {
        respond(false, { error: "item must have id, type, and title" });
        return;
      }
      const item = upsertItem(params as Item);
      respond(true, { item });
    },
  );

  api.registerGatewayMethod(
    "aight.items.delete",
    ({ params, respond }: GatewayRequestHandlerOptions) => {
      const id = typeof params?.id === "string" ? params.id : "";
      if (!id) {
        respond(false, { error: "id required" });
        return;
      }
      const ok = deleteItem(id);
      respond(true, { ok, id });
    },
  );

  api.registerTool({
    name: "aight_item",
    description:
      "Create, update, or delete a structured item in the Aight Today view. " +
      "Use for reminders, tasks, events, deadlines, and process tracking. " +
      "Parse natural language dates/times before calling (e.g. 'tomorrow at 3pm' → ISO 8601).",
    parameters: AightItemToolParams,
    async execute(_toolCallId, params) {
      const json = (payload: unknown) => ({
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      });

      try {
        if (params.action === "delete") {
          const id = params.id ?? params.item?.id;
          if (!id) throw new Error("id required for delete");
          const ok = deleteItem(id);
          return json({ ok, id });
        }

        if (!params.item) throw new Error("item required for create/update");
        if (!params.item.id || !params.item.type || !params.item.title) {
          throw new Error("item must have id, type, and title");
        }

        const item = upsertItem(params.item);
        return json({ action: params.action, item });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  });
}

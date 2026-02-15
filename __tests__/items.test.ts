import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadItems,
  saveItems,
  upsertItem,
  deleteItem,
  listItems,
  registerItems,
  type Item,
} from "../src/items.js";

const STORE_DIR = path.join(os.homedir(), ".openclaw", "aight");
const STORE_PATH = path.join(STORE_DIR, "items.json");
let backup: string | null = null;

beforeEach(() => {
  try {
    backup = fs.readFileSync(STORE_PATH, "utf-8");
  } catch {
    backup = null;
  }
  try {
    fs.unlinkSync(STORE_PATH);
  } catch {}
});
afterEach(() => {
  if (backup !== null) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, backup);
  } else {
    try {
      fs.unlinkSync(STORE_PATH);
    } catch {}
  }
});

const makeItem = (o: Partial<Item> = {}): Item => ({
  id: "t1",
  type: "item",
  title: "Test",
  ...o,
});

describe("items store", () => {
  it("loadItems empty", () => expect(loadItems()).toEqual([]));
  it("round-trip", () => {
    saveItems([makeItem()]);
    expect(loadItems()).toHaveLength(1);
  });
  it("upsert creates", () => {
    const item = upsertItem(makeItem());
    expect(item.status).toBe("active");
    expect(loadItems()).toHaveLength(1);
  });
  it("upsert updates", () => {
    upsertItem(makeItem());
    upsertItem(makeItem({ title: "Updated" }));
    expect(loadItems()).toHaveLength(1);
    expect(loadItems()[0].title).toBe("Updated");
  });
  it("delete soft-deletes", () => {
    upsertItem(makeItem());
    expect(deleteItem("t1")).toBe(true);
    expect(loadItems()[0].status).toBe("deleted");
  });
  it("delete missing", () => expect(deleteItem("nope")).toBe(false));
});

describe("listItems", () => {
  beforeEach(() => {
    upsertItem(
      makeItem({
        id: "1",
        type: "trigger",
        labels: ["reminder"],
        scheduledFor: "2026-03-01T00:00:00Z",
      }),
    );
    upsertItem(makeItem({ id: "2", type: "item", labels: ["work"] }));
  });

  it("excludes deleted", () => {
    deleteItem("2");
    expect(listItems()).toHaveLength(1);
  });
  it("filters by type", () => expect(listItems({ type: "trigger" })).toHaveLength(1));
  it("filters by labels", () => expect(listItems({ labels: ["work"] })).toHaveLength(1));
  it("filters by date from", () =>
    expect(listItems({ from: "2026-06-01T00:00:00Z" })).toHaveLength(1)); // item without scheduledFor passes
});

describe("items RPC + tool", () => {
  function mockApi() {
    const methods: Record<string, Function> = {};
    const tools: any[] = [];
    return {
      api: {
        pluginConfig: {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerGatewayMethod: (m: string, h: Function) => {
          methods[m] = h;
        },
        registerTool: (t: any) => tools.push(t),
      } as any,
      methods,
      tools,
    };
  }

  it("list returns items", () => {
    upsertItem(makeItem());
    const { api, methods } = mockApi();
    registerItems(api);
    const respond = vi.fn();
    methods["aight.items.list"]({ params: {}, respond });
    expect(respond).toHaveBeenCalledWith(true, {
      items: expect.arrayContaining([expect.objectContaining({ id: "t1" })]),
    });
  });

  it("upsert via RPC", () => {
    const { api, methods } = mockApi();
    registerItems(api);
    const respond = vi.fn();
    methods["aight.items.upsert"]({ params: { id: "n1", type: "item", title: "New" }, respond });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ item: expect.objectContaining({ id: "n1" }) }),
    );
  });

  it("delete via RPC", () => {
    upsertItem(makeItem({ id: "d1" }));
    const { api, methods } = mockApi();
    registerItems(api);
    const respond = vi.fn();
    methods["aight.items.delete"]({ params: { id: "d1" }, respond });
    expect(respond).toHaveBeenCalledWith(true, { ok: true, id: "d1" });
  });

  it("registers aight_item tool", () => {
    const { api, tools } = mockApi();
    registerItems(api);
    expect(tools[0].name).toBe("aight_item");
  });

  it("aight_item tool creates item", async () => {
    const { api, tools } = mockApi();
    registerItems(api);
    const result = await tools[0].execute("id", {
      action: "create",
      item: makeItem({ id: "tool-1", title: "Remind me" }),
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action).toBe("create");
    expect(parsed.item.id).toBe("tool-1");
  });

  it("aight_item tool deletes item", async () => {
    upsertItem(makeItem({ id: "del-1" }));
    const { api, tools } = mockApi();
    registerItems(api);
    const result = await tools[0].execute("id", { action: "delete", id: "del-1" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadTokens,
  saveTokens,
  registerToken,
  unregisterToken,
  sendPush,
  registerPush,
} from "../src/push.js";

const TOKEN_DIR = path.join(os.homedir(), ".openclaw", "aight");
const TOKEN_FILE = path.join(TOKEN_DIR, "devices.json");

let backup: string | null = null;

beforeEach(() => {
  try {
    backup = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf-8") : null;
  } catch {
    backup = null;
  }
  saveTokens([]);
});

afterEach(() => {
  if (backup !== null) {
    fs.writeFileSync(TOKEN_FILE, backup, "utf-8");
  } else if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
  }
  vi.unstubAllGlobals();
});

describe("push token store", () => {
  it("starts empty", () => {
    expect(loadTokens()).toEqual([]);
  });

  it("registers a token", () => {
    registerToken({
      deviceId: "dev-1",
      pushToken: "abc123",
      platform: "ios",
      registeredAt: new Date().toISOString(),
    });
    const tokens = loadTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].deviceId).toBe("dev-1");
  });

  it("updates existing token by deviceId", () => {
    registerToken({ deviceId: "dev-1", pushToken: "old", platform: "ios", registeredAt: "" });
    registerToken({ deviceId: "dev-1", pushToken: "new", platform: "ios", registeredAt: "" });
    expect(loadTokens()).toHaveLength(1);
    expect(loadTokens()[0].pushToken).toBe("new");
  });

  it("unregisters a token", () => {
    registerToken({ deviceId: "dev-1", pushToken: "abc", platform: "ios", registeredAt: "" });
    expect(unregisterToken("dev-1")).toBe(true);
    expect(loadTokens()).toHaveLength(0);
  });

  it("unregister returns false for unknown", () => {
    expect(unregisterToken("unknown")).toBe(false);
  });
});

describe("sendPush", () => {
  it("fails when no device token exists", async () => {
    const result = await sendPush("unknown-device", { title: "Test" }, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No device token");
  });

  it("sends to relay in private mode", async () => {
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", registeredAt: "" });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => "" });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendPush(
      "dev-1",
      { title: "Hello", body: "World" },
      { push: { mode: "private", relayUrl: "https://test.relay" } },
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.relay/send",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.silent).toBe(true);
  });

  it("includes text in rich mode", async () => {
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", registeredAt: "" });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => "" });
    vi.stubGlobal("fetch", mockFetch);

    await sendPush(
      "dev-1",
      { title: "Hello", body: "World" },
      { push: { mode: "rich", relayUrl: "https://test.relay" } },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.silent).toBe(false);
    expect(body.title).toBe("Hello");
    expect(body.body).toBe("World");
  });
});

describe("push RPC", () => {
  function createMockApi() {
    const methods: Record<string, Function> = {};
    return {
      api: {
        pluginConfig: {},
        config: {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        registerGatewayMethod: (name: string, handler: Function) => {
          methods[name] = handler;
        },
        registerTool: vi.fn(),
        registerService: vi.fn(),
      } as any,
      methods,
    };
  }

  it("registers push token via RPC", () => {
    const { api, methods } = createMockApi();
    registerPush(api, {});
    const respond = vi.fn();
    methods["aight.push.register"]({
      params: { deviceId: "dev-1", pushToken: "tok", platform: "ios" },
      respond,
    });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));
  });

  it("rejects invalid register params", () => {
    const { api, methods } = createMockApi();
    registerPush(api, {});
    const respond = vi.fn();
    methods["aight.push.register"]({ params: { deviceId: "dev-1" }, respond });
    expect(respond).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("unregisters device", () => {
    const { api, methods } = createMockApi();
    registerPush(api, {});
    // First register
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", registeredAt: "" });
    const respond = vi.fn();
    methods["aight.push.unregister"]({ params: { deviceId: "dev-1" }, respond });
    expect(respond).toHaveBeenCalledWith(true, { ok: true, deviceId: "dev-1" });
  });
});

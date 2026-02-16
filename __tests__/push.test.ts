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
    const before = loadTokens().length;
    registerToken({
      deviceId: "dev-1",
      pushToken: "abc123",
      platform: "ios",
      sendKey: "key123",
      registeredAt: new Date().toISOString(),
    });
    const tokens = loadTokens();
    expect(tokens.length).toBe(before + 1);
    const token = tokens.find((t) => t.deviceId === "dev-1");
    expect(token).toBeTruthy();
    expect(token!.sendKey).toBe("key123");
  });

  it("updates existing token by deviceId", () => {
    registerToken({ deviceId: "dev-1", pushToken: "old", platform: "ios", sendKey: "k1", registeredAt: "" });
    registerToken({ deviceId: "dev-1", pushToken: "new", platform: "ios", sendKey: "k2", registeredAt: "" });
    expect(loadTokens()).toHaveLength(1);
    expect(loadTokens()[0].pushToken).toBe("new");
    expect(loadTokens()[0].sendKey).toBe("k2");
  });

  it("unregisters a token", () => {
    registerToken({ deviceId: "dev-1", pushToken: "abc", platform: "ios", sendKey: "k", registeredAt: "" });
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

  it("fails when no sendKey exists", async () => {
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", registeredAt: "" });
    const result = await sendPush("dev-1", { title: "Test" }, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No sendKey");
  });

  it("sends to relay in private mode with sendKey", async () => {
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", sendKey: "sk123", registeredAt: "" });
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
    expect(body.sendKey).toBe("sk123");
    expect(body.token).toBe("tok");
  });

  it("includes text in rich mode", async () => {
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", sendKey: "sk123", registeredAt: "" });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => "" });
    vi.stubGlobal("fetch", mockFetch);

    await sendPush(
      "dev-1",
      { title: "Hello", body: "World" },
      { push: { mode: "rich", relayUrl: "https://test.relay" } },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
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

  it("registers push token via RPC and obtains sendKey in background", async () => {
    let fetchResolve: (v: unknown) => void;
    const fetchPromise = new Promise((r) => { fetchResolve = r; });
    const mockFetch = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", mockFetch);

    const { api, methods } = createMockApi();
    registerPush(api, { push: { relayUrl: "https://test.relay" } });
    const respond = vi.fn();
    // Handler is sync — responds immediately
    methods["aight.push.register"]({
      params: { deviceId: "dev-1", pushToken: "tok", platform: "ios" },
      respond,
    });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));

    // Resolve the background fetch
    fetchResolve!({
      ok: true,
      json: () => Promise.resolve({ ok: true, sendKey: "derived-key" }),
    });
    // Let microtasks flush
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.relay/register",
      expect.objectContaining({ method: "POST" }),
    );
    const token = loadTokens().find((t) => t.deviceId === "dev-1");
    expect(token).toBeTruthy();
    expect(token!.sendKey).toBe("derived-key");
  });

  it("rejects invalid register params", async () => {
    const { api, methods } = createMockApi();
    registerPush(api, {});
    const respond = vi.fn();
    await methods["aight.push.register"]({ params: { deviceId: "dev-1" }, respond });
    expect(respond).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("handles relay registration failure gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api, methods } = createMockApi();
    registerPush(api, { push: { relayUrl: "https://test.relay" } });
    const respond = vi.fn();
    // Handler still responds ok (registers token, sendKey obtained in background)
    methods["aight.push.register"]({
      params: { deviceId: "dev-1", pushToken: "tok", platform: "ios" },
      respond,
    });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }));

    // Let background fetch fail
    await new Promise((r) => setTimeout(r, 10));
    // Token registered but no sendKey
    const token = loadTokens().find((t) => t.deviceId === "dev-1");
    expect(token).toBeTruthy();
    expect(token!.sendKey).toBeUndefined();
    expect(api.logger.warn).toHaveBeenCalled();
  });

  it("unregisters device", () => {
    const { api, methods } = createMockApi();
    registerPush(api, {});
    registerToken({ deviceId: "dev-1", pushToken: "tok", platform: "ios", sendKey: "k", registeredAt: "" });
    const respond = vi.fn();
    methods["aight.push.unregister"]({ params: { deviceId: "dev-1" }, respond });
    expect(respond).toHaveBeenCalledWith(true, { ok: true, deviceId: "dev-1" });
  });
});

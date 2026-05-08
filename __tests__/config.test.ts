import { describe, it, expect, vi } from "vitest";
import { registerConfig } from "../src/config.js";

function createMockApi(pluginConfig: any = {}) {
  const methods: Record<string, Function> = {};
  return {
    api: {
      pluginConfig,
      config: { plugins: { entries: { "aight-utils": { config: pluginConfig } } } },
      runtime: {
        config: {
          writeConfigFile: vi.fn(),
          loadConfig: vi
            .fn()
            .mockReturnValue({ plugins: { entries: { "aight-utils": { config: pluginConfig } } } }),
        },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerGatewayMethod: (method: string, handler: Function) => {
        methods[method] = handler;
      },
    } as any,
    methods,
  };
}

describe("config RPC", () => {
  it("aight.config.get returns plugin config", () => {
    const { api, methods } = createMockApi({ push: { mode: "rich" } });
    registerConfig(api);
    const respond = vi.fn();
    methods["aight.config.get"]({ respond });
    expect(respond).toHaveBeenCalledWith(true, { push: { mode: "rich" } });
  });

  it("aight.config.patch returns patch with note", async () => {
    const { api, methods } = createMockApi();
    registerConfig(api);
    const respond = vi.fn();
    await methods["aight.config.patch"]({ params: { push: { mode: "private" } }, respond });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ config: expect.objectContaining({ push: { mode: "private" } }) }),
    );
  });

  it("aight.config.patch rejects non-object", () => {
    const { api, methods } = createMockApi();
    registerConfig(api);
    const respond = vi.fn();
    methods["aight.config.patch"]({ params: null, respond });
    expect(respond).toHaveBeenCalledWith(false, { error: "params must be an object" });
  });

  it("aight.status returns status info", async () => {
    const { api, methods } = createMockApi();
    registerConfig(api);
    const respond = vi.fn();
    await methods["aight.status"]({ respond });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, version: "0.1.0", pushHookActive: false }),
    );
  });

  it("aight.status reports pushHookActive=true when flag set", async () => {
    const { api, methods } = createMockApi();
    api.runtime.config.loadConfig = vi.fn().mockResolvedValue({
      plugins: {
        entries: {
          "aight-utils": { hooks: { allowConversationAccess: true } },
        },
      },
    });
    registerConfig(api);
    const respond = vi.fn();
    await methods["aight.status"]({ respond });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ pushHookActive: true }));
  });
});

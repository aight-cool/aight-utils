import { describe, it, expect, vi } from "vitest";
import { registerConfig } from "../src/config.js";

function createMockApi(pluginConfig: any = {}) {
  const methods: Record<string, Function> = {};
  let storedConfig: any = { plugins: { entries: { "aight-utils": { config: pluginConfig } } } };
  return {
    api: {
      pluginConfig,
      config: storedConfig,
      runtime: {
        config: {
          current: vi.fn(() => storedConfig),
          mutateConfigFile: vi.fn(async ({ mutate }: { mutate: (draft: any) => unknown }) => {
            const draft = structuredClone(storedConfig);
            const result = await mutate(draft);
            storedConfig = draft;
            return {
              result,
              afterWrite: { mode: "auto" },
              followUp: { mode: "auto", requiresRestart: false },
            };
          }),
        },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerGatewayMethod: (method: string, handler: Function) => {
        methods[method] = handler;
      },
    } as any,
    methods,
    setConfig: (next: any) => {
      storedConfig = next;
    },
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
      expect.objectContaining({ ok: true, version: "0.1.0", pushHookEnabled: false }),
    );
  });

  it("aight.status reports pushHookEnabled=true when flag set", async () => {
    const { api, methods, setConfig } = createMockApi();
    setConfig({
      plugins: {
        entries: {
          "aight-utils": { hooks: { allowConversationAccess: true } },
        },
      },
    });
    registerConfig(api);
    const respond = vi.fn();
    await methods["aight.status"]({ respond });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ pushHookEnabled: true }));
  });
});

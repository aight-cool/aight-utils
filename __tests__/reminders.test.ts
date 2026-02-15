import { describe, it, expect, vi } from "vitest";
import { registerReminders } from "../src/reminders.js";

describe("reminders service", () => {
  function createMockApi() {
    const services: Record<string, any> = {};
    return {
      api: {
        pluginConfig: {},
        config: {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        registerGatewayMethod: vi.fn(),
        registerTool: vi.fn(),
        registerService: (svc: any) => {
          services[svc.id] = svc;
        },
      } as any,
      services,
    };
  }

  it("registers aight-reminders service", () => {
    const { api, services } = createMockApi();
    registerReminders(api, { today: { enabled: true } });
    expect(services["aight-reminders"]).toBeDefined();
  });

  it("start and stop work without errors", () => {
    const { api, services } = createMockApi();
    registerReminders(api, { today: { enabled: true } });
    const svc = services["aight-reminders"];
    svc.start();
    svc.stop();
  });

  it("skips start when today is disabled", () => {
    const { api, services } = createMockApi();
    registerReminders(api, { today: { enabled: false } });
    const svc = services["aight-reminders"];
    svc.start();
    expect(api.logger.info).toHaveBeenCalledWith(expect.stringContaining("disabled"));
  });
});

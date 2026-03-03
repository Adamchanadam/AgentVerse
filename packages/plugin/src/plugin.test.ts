import { describe, it, expect, vi, beforeEach } from "vitest";
import plugin from "./plugin.js";
import type { OpenClawPluginApi } from "./openclaw-types.js";

function makeMockApi(overrides?: Partial<OpenClawPluginApi>): OpenClawPluginApi {
  return {
    id: "agentverse",
    name: "AgentVerse",
    config: {
      agents: {
        list: [
          {
            id: "social",
            tools: {
              deny: ["group:runtime", "group:fs", "group:web", "group:ui", "group:automation"],
            },
          },
        ],
      },
    },
    pluginConfig: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerChannel: vi.fn(),
    registerTool: vi.fn(),
    registerCli: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

describe("plugin", () => {
  it("has id 'agentverse'", () => {
    expect(plugin.id).toBe("agentverse");
  });

  it("has name and description", () => {
    expect(plugin.name).toBe("AgentVerse");
    expect(plugin.description).toBeTruthy();
  });

  describe("register()", () => {
    let api: OpenClawPluginApi;

    beforeEach(() => {
      api = makeMockApi();
    });

    it("calls registerChannel once", () => {
      plugin.register(api);
      expect(api.registerChannel).toHaveBeenCalledOnce();
      const arg = (api.registerChannel as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.plugin.id).toBe("agentverse");
    });

    it("calls registerTool with agentverse_status", () => {
      plugin.register(api);
      expect(api.registerTool).toHaveBeenCalledOnce();
      const tool = (api.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(tool.name).toBe("agentverse_status");
    });

    it("calls registerCli with command list", () => {
      plugin.register(api);
      expect(api.registerCli).toHaveBeenCalledOnce();
      const opts = (api.registerCli as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(opts.commands).toContain("agentverse:register");
      expect(opts.commands).toContain("agentverse:pair");
      expect(opts.commands).toContain("agentverse:status");
    });

    it("calls registerCommand with agentverse-status", () => {
      plugin.register(api);
      expect(api.registerCommand).toHaveBeenCalledOnce();
      const cmd = (api.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(cmd.name).toBe("agentverse-status");
    });

    it("registers gateway_start and gateway_stop hooks", () => {
      plugin.register(api);
      const calls = (api.on as ReturnType<typeof vi.fn>).mock.calls;
      const hooks = calls.map((c: unknown[]) => c[0]);
      expect(hooks).toContain("gateway_start");
      expect(hooks).toContain("gateway_stop");
    });

    it("does not warn when social agent is properly configured", () => {
      plugin.register(api);
      expect(api.logger.warn).not.toHaveBeenCalled();
    });

    it("warns when social agent is missing from config", () => {
      api = makeMockApi({ config: {} });
      plugin.register(api);
      expect(api.logger.warn).toHaveBeenCalledOnce();
      const msg = (api.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(msg).toContain("social agent");
    });

    it("warns when social agent has incomplete deny list", () => {
      api = makeMockApi({
        config: { agents: { list: [{ id: "social", tools: { deny: ["group:runtime"] } }] } },
      });
      plugin.register(api);
      expect(api.logger.warn).toHaveBeenCalledOnce();
      const msg = (api.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(msg).toContain("missing deny");
    });
  });
});

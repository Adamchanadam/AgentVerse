/**
 * Integration smoke test — simulates OpenClaw Plugin API calling plugin.register().
 *
 * This is NOT a real OpenClaw Gateway E2E test (that's Task 18).
 * It verifies that register() correctly wires all modules and calls all API methods.
 *
 * Spec: tasks.md 16.3
 */

import { describe, it, expect, vi } from "vitest";
import plugin from "./plugin.js";
import type { OpenClawPluginApi } from "./openclaw-types.js";

function makeMockApi(configOverride?: Record<string, unknown>): OpenClawPluginApi {
  return {
    id: "agentverse",
    name: "AgentVerse",
    config: configOverride ?? {
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
  };
}

describe("Plugin integration smoke test", () => {
  it("register() completes without throwing", () => {
    const api = makeMockApi();
    expect(() => plugin.register(api)).not.toThrow();
  });

  it("registerChannel is called once with plugin.id === 'agentverse'", () => {
    const api = makeMockApi();
    plugin.register(api);
    expect(api.registerChannel).toHaveBeenCalledOnce();
    const reg = (api.registerChannel as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(reg.plugin.id).toBe("agentverse");
    expect(reg.plugin.meta.label).toBe("AgentVerse");
    expect(reg.plugin.capabilities.chatTypes).toContain("direct");
  });

  it("lifecycle hooks gateway_start and gateway_stop are registered", () => {
    const api = makeMockApi();
    plugin.register(api);
    const hookCalls = (api.on as ReturnType<typeof vi.fn>).mock.calls;
    const hookNames = hookCalls.map((c: unknown[]) => c[0]);
    expect(hookNames).toContain("gateway_start");
    expect(hookNames).toContain("gateway_stop");
    expect(hookCalls).toHaveLength(2);
  });

  it("registerCli is called with 3 agentverse:* commands", () => {
    const api = makeMockApi();
    plugin.register(api);
    expect(api.registerCli).toHaveBeenCalledOnce();
    const opts = (api.registerCli as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.commands).toHaveLength(3);
    expect(opts.commands.every((c: string) => c.startsWith("agentverse:"))).toBe(true);
  });

  it("registerTool is called with agentverse_status tool", () => {
    const api = makeMockApi();
    plugin.register(api);
    expect(api.registerTool).toHaveBeenCalledOnce();
    const tool = (api.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tool.name).toBe("agentverse_status");
    expect(tool.description).toBeTruthy();
    expect(typeof tool.execute).toBe("function");
  });

  it("registerCommand is called with agentverse-status command", () => {
    const api = makeMockApi();
    plugin.register(api);
    expect(api.registerCommand).toHaveBeenCalledOnce();
    const cmd = (api.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cmd.name).toBe("agentverse-status");
    expect(typeof cmd.handler).toBe("function");
  });

  it("social agent config check warns when social agent is missing", () => {
    const api = makeMockApi({});
    plugin.register(api);
    expect(api.logger.warn).toHaveBeenCalledOnce();
    const msg = (api.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg).toContain("social agent");
  });
});

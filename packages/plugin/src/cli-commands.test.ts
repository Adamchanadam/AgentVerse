import { describe, it, expect, vi } from "vitest";
import { buildCliRegistrar, CLI_COMMANDS } from "./cli-commands.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { IdentityManager } from "./identity.js";
import type { PluginConfig } from "./config.js";
import type { CliContext } from "./openclaw-types.js";

function makeMocks() {
  const ws = {
    state: "connected" as string,
    send: vi.fn(),
  } as unknown as WebSocketConnectionManager;

  const identity = {
    ensureKeypair: vi.fn(),
    getPublicKeyHex: vi.fn().mockReturnValue("aabb".repeat(16)),
    sign: vi.fn().mockReturnValue("cc".repeat(64)),
  } as unknown as IdentityManager;

  const config: PluginConfig = {
    hubUrl: "ws://localhost:3000/ws",
    publicFields: ["display_name"],
  };

  return { ws, identity, config };
}

function makeProgram() {
  const commands = new Map<
    string,
    { desc: string; action: (...args: unknown[]) => Promise<void> }
  >();

  const program = {
    command(name: string) {
      return {
        description(desc: string) {
          return {
            action(fn: (...args: unknown[]) => Promise<void>) {
              commands.set(name, { desc, action: fn });
              return {};
            },
          };
        },
      };
    },
  };

  return { program, commands };
}

describe("buildCliRegistrar", () => {
  it("exports CLI_COMMANDS with 3 command names", () => {
    expect(CLI_COMMANDS).toHaveLength(3);
    expect(CLI_COMMANDS).toContain("agentverse:register");
    expect(CLI_COMMANDS).toContain("agentverse:pair");
    expect(CLI_COMMANDS).toContain("agentverse:status");
  });

  it("registers all 3 subcommands to program", () => {
    const { ws, identity, config } = makeMocks();
    const { program, commands } = makeProgram();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const registrar = buildCliRegistrar(ws, identity, config);
    registrar({ program, config: {}, logger } as unknown as CliContext);
    expect(commands.size).toBe(3);
    for (const cmd of CLI_COMMANDS) {
      expect(commands.has(cmd)).toBe(true);
    }
  });

  it("agentverse:register sends agent.registered via WS", async () => {
    const { ws, identity, config } = makeMocks();
    const { program, commands } = makeProgram();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const registrar = buildCliRegistrar(ws, identity, config);
    registrar({ program, config: {}, logger } as unknown as CliContext);

    await commands.get("agentverse:register")!.action();

    expect(identity.ensureKeypair).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledOnce();
    const frame = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(frame.type).toBe("submit_event");
    expect(frame.payload.event_type).toBe("agent.registered");
  });

  it("agentverse:status outputs connection state", async () => {
    const { ws, identity, config } = makeMocks();
    const { program, commands } = makeProgram();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const registrar = buildCliRegistrar(ws, identity, config);
    registrar({ program, config: {}, logger } as unknown as CliContext);

    await commands.get("agentverse:status")!.action();

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("connected"));
  });

  it("agentverse:register handles WS errors gracefully", async () => {
    const { ws, identity, config } = makeMocks();
    (ws.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("not connected");
    });
    const { program, commands } = makeProgram();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const registrar = buildCliRegistrar(ws, identity, config);
    registrar({ program, config: {}, logger } as unknown as CliContext);

    await commands.get("agentverse:register")!.action();

    expect(logger.error).toHaveBeenCalledWith("Failed to register:", expect.any(Error));
  });
});

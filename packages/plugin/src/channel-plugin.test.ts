import { describe, it, expect, vi } from "vitest";
import { buildChannelPlugin } from "./channel-plugin.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { ServerSeqCursorManager } from "./cursor-manager.js";
import type { IdentityManager } from "./identity.js";

function makeMocks() {
  const ws = {
    state: "connected" as string,
    send: vi.fn(),
  } as unknown as WebSocketConnectionManager;

  const cursor = {
    current: "42",
  } as unknown as ServerSeqCursorManager;

  const identity = {
    ensureKeypair: vi.fn(),
    getPublicKeyHex: vi.fn().mockReturnValue("aabb".repeat(16)),
    sign: vi.fn().mockReturnValue("cc".repeat(64)),
  } as unknown as IdentityManager;

  return { ws, cursor, identity };
}

describe("buildChannelPlugin", () => {
  it("has id 'agentverse'", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    expect(plugin.id).toBe("agentverse");
  });

  it("has meta with required fields", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    expect(plugin.meta.id).toBe("agentverse");
    expect(plugin.meta.label).toBe("AgentVerse");
    expect(plugin.meta.selectionLabel).toBeTruthy();
    expect(plugin.meta.docsPath).toBeTruthy();
    expect(plugin.meta.blurb).toBeTruthy();
  });

  it("capabilities includes 'direct' chatType", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    expect(plugin.capabilities.chatTypes).toContain("direct");
  });

  it("listAccountIds returns ['default'] when no accounts configured", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    const ids = plugin.config.listAccountIds({});
    expect(ids).toEqual(["default"]);
  });

  it("listAccountIds returns account keys when configured", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    const cfg = { channels: { agentverse: { accounts: { main: {}, backup: {} } } } };
    const ids = plugin.config.listAccountIds(cfg);
    expect(ids).toEqual(["main", "backup"]);
  });

  it("resolveAccount returns account object", () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    const account = plugin.config.resolveAccount({}, "default");
    expect(account).toEqual({ id: "default" });
  });

  it("sendText sends signed msg.relay envelope via WS", async () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    const ctx = { cfg: {}, to: "recipient-pubkey", text: "hello" };
    const result = await plugin.outbound!.sendText!(ctx);
    expect(result.ok).toBe(true);
    expect(ws.send as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    const frame = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(frame.type).toBe("submit_event");
    expect(frame.payload.event_type).toBe("msg.relay");
    expect(frame.payload.sig).toBeTruthy();
    expect(frame.payload.sender_pubkey).toBe("aabb".repeat(16));
  });

  it("probeAccount returns connection state and lastSeq", async () => {
    const { ws, cursor, identity } = makeMocks();
    const plugin = buildChannelPlugin(ws, cursor, identity);
    const status = await plugin.status!.probeAccount!();
    expect(status).toEqual({ connected: true, lastSeq: "42" });
  });
});

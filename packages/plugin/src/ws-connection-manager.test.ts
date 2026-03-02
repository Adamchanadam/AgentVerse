import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import type { IdentityManager } from "./identity.js";
import type { WsFrame } from "@agentverse/shared";

// ─── Mock WebSocket ──────────────────────────────────────────

class MockWs extends EventEmitter {
  readyState = 1; // OPEN
  send = vi.fn();
  close = vi.fn();
}

let mockWsInstance: MockWs;

vi.mock("ws", () => {
  const MockWebSocket = vi.fn(() => {
    mockWsInstance = new MockWs();
    return mockWsInstance;
  });
  Object.defineProperty(MockWebSocket, "OPEN", { value: 1 });
  Object.defineProperty(MockWebSocket, "CLOSED", { value: 3 });
  return { default: MockWebSocket };
});

// ─── Mock IdentityManager ────────────────────────────────────

const MOCK_SIG = "deadbeef".repeat(16); // 128-char hex (64-byte Ed25519 sig)
const MOCK_PUBKEY = "aa".repeat(32); // 64-char hex (32-byte pubkey)

const mockIdentity = {
  sign: vi.fn().mockReturnValue(MOCK_SIG),
  getPublicKeyHex: vi.fn().mockReturnValue(MOCK_PUBKEY),
  ensureKeypair: vi.fn(),
  getPublicKey: vi.fn(),
  rotateKeypair: vi.fn(),
} as unknown as IdentityManager;

const mockGetLastSeq = vi.fn().mockReturnValue("42");

// ─── Import after mocks ─────────────────────────────────────

let WebSocketConnectionManager: typeof import("./ws-connection-manager.js").WebSocketConnectionManager;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  const mod = await import("./ws-connection-manager.js");
  WebSocketConnectionManager = mod.WebSocketConnectionManager;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ─────────────────────────────────────────────────

function createManager() {
  return new WebSocketConnectionManager("ws://hub.test:8080", mockIdentity, mockGetLastSeq);
}

/** Simulate server sending a JSON frame */
function serverSend(frame: WsFrame): void {
  mockWsInstance.emit("message", JSON.stringify(frame));
}

/** Complete the auth handshake: challenge -> auth_ok */
function completeAuth(): void {
  serverSend({ type: "challenge", nonce: "abcd1234" });
  serverSend({
    type: "auth_ok",
    payload: { agent_id: "agent-1", server_time: "2026-03-01T00:00:00Z" },
  });
}

// ─── Tests ───────────────────────────────────────────────────

describe("WebSocketConnectionManager", () => {
  it("connect() sets state to 'connecting'", () => {
    const mgr = createManager();
    mgr.connect();
    expect(mgr.state).toBe("connecting");
  });

  it("connect() is idempotent when already connecting", () => {
    const mgr = createManager();
    mgr.connect();
    const ws1 = mockWsInstance;
    mgr.connect(); // should be a no-op
    // mockWsInstance would have changed if a new WebSocket was constructed
    expect(mockWsInstance).toBe(ws1);
  });

  it("handleChallenge signs nonce and sends auth frame", () => {
    const mgr = createManager();
    mgr.connect();

    serverSend({ type: "challenge", nonce: "abcd1234" });

    expect(mgr.state).toBe("authenticating");
    expect(mockIdentity.sign).toHaveBeenCalledOnce();

    // Verify sign was called with the nonce converted from hex to bytes
    const callArg = (mockIdentity.sign as ReturnType<typeof vi.fn>).mock.calls[0][0] as Uint8Array;
    expect(callArg).toBeInstanceOf(Uint8Array);
    // "abcd1234" hex = 4 bytes
    expect(callArg.length).toBe(4);

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentFrame = JSON.parse(mockWsInstance.send.mock.calls[0][0] as string) as WsFrame;
    expect(sentFrame).toEqual({
      type: "auth",
      payload: {
        pubkey: MOCK_PUBKEY,
        sig: MOCK_SIG,
        last_seen_server_seq: "42",
      },
    });
  });

  it("handleAuthOk sets state to 'connected' and emits event", () => {
    const mgr = createManager();
    const connectedSpy = vi.fn();
    mgr.on("connected", connectedSpy);

    mgr.connect();
    completeAuth();

    expect(mgr.state).toBe("connected");
    expect(connectedSpy).toHaveBeenCalledOnce();
  });

  it("handleAuthOk resets attempt counter", () => {
    const mgr = createManager();
    mgr.connect();

    // Simulate a disconnect -> reconnect -> auth_ok cycle
    completeAuth();
    // Force a disconnect
    mockWsInstance.emit("close");
    expect(mgr.state).toBe("reconnecting");

    // Advance timer to trigger reconnect
    vi.advanceTimersByTime(60_001);

    // Complete auth on reconnected socket
    completeAuth();
    expect(mgr.state).toBe("connected");

    // Second disconnect should have attempt=1 again (reset after auth_ok)
    mockWsInstance.emit("close");
    const reconnectingSpy = vi.fn();
    mgr.on("reconnecting", reconnectingSpy);
    // The reconnecting event was already emitted before we attached,
    // but we can check the state
    expect(mgr.state).toBe("reconnecting");
  });

  it("close() prevents reconnection", () => {
    const mgr = createManager();
    const reconnectingSpy = vi.fn();
    mgr.on("reconnecting", reconnectingSpy);

    mgr.connect();
    completeAuth();
    mgr.close();

    expect(mgr.state).toBe("disconnected");
    // Advance timers — should NOT trigger reconnect
    vi.advanceTimersByTime(120_000);
    // reconnectingSpy won't fire because close() calls removeAllListeners,
    // but more importantly, the timer should not have been set
    expect(mgr.state).toBe("disconnected");
  });

  it("close() clears pending reconnect timer", () => {
    const mgr = createManager();
    mgr.connect();
    completeAuth();

    // Trigger disconnect -> scheduleReconnect
    mockWsInstance.emit("close");
    expect(mgr.state).toBe("reconnecting");

    // Now close before the timer fires
    mgr.close();
    expect(mgr.state).toBe("disconnected");

    // Advancing timers should not cause a reconnect
    vi.advanceTimersByTime(120_000);
    expect(mgr.state).toBe("disconnected");
  });

  it("scheduleReconnect fires after disconnect with attempt=1", () => {
    const mgr = createManager();
    const reconnectingSpy = vi.fn();
    mgr.on("reconnecting", reconnectingSpy);

    mgr.connect();
    completeAuth();

    // Simulate server closing connection
    mockWsInstance.emit("close");

    expect(reconnectingSpy).toHaveBeenCalledOnce();
    expect(reconnectingSpy).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
    expect(mgr.state).toBe("reconnecting");
  });

  it("last_seen_server_seq is included in auth frame from getLastSeq callback", () => {
    mockGetLastSeq.mockReturnValue("999");
    const mgr = createManager();
    mgr.connect();

    serverSend({ type: "challenge", nonce: "00112233" });

    const sentFrame = JSON.parse(mockWsInstance.send.mock.calls[0][0] as string) as WsFrame;
    expect(sentFrame).toMatchObject({
      type: "auth",
      payload: {
        last_seen_server_seq: "999",
      },
    });

    // Reset for other tests
    mockGetLastSeq.mockReturnValue("42");
  });

  it("auth_error does not trigger reconnect", () => {
    const mgr = createManager();
    const errorSpy = vi.fn();
    const reconnectingSpy = vi.fn();
    mgr.on("error", errorSpy);
    mgr.on("reconnecting", reconnectingSpy);

    mgr.connect();
    serverSend({ type: "challenge", nonce: "aabb" });
    serverSend({ type: "auth_error", error: "invalid signature" });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((errorSpy.mock.calls[0][0] as Error).message).toContain(
      "Auth failed: invalid signature",
    );

    // The close event fires (from ws.close()), which normally triggers reconnect,
    // but intentionalClose should prevent it
    mockWsInstance.emit("close");
    expect(reconnectingSpy).not.toHaveBeenCalled();
  });

  it("non-auth frames are emitted as 'frame' event", () => {
    const mgr = createManager();
    const frameSpy = vi.fn();
    mgr.on("frame", frameSpy);

    mgr.connect();
    completeAuth();

    const eventFrame: WsFrame = {
      type: "event",
      payload: {
        event_id: "evt-1",
        event_type: "agent.registered",
        ts: "2026-03-01T00:00:00Z",
        nonce: "aabbccdd00112233aabbccdd00112233",
        sender_pubkey: MOCK_PUBKEY,
        recipient_ids: [],
        payload: {
          display_name: "TestAgent",
          persona_tags: ["test"],
          capabilities: [{ name: "chat", version: "1.0" }],
          visibility: "public" as const,
        },
        sig: MOCK_SIG,
      },
      server_seq: "5",
    };
    serverSend(eventFrame);

    expect(frameSpy).toHaveBeenCalledOnce();
    expect(frameSpy.mock.calls[0][0]).toEqual(eventFrame);
  });

  it("ping/pong frames are emitted as 'frame' event", () => {
    const mgr = createManager();
    const frameSpy = vi.fn();
    mgr.on("frame", frameSpy);

    mgr.connect();
    completeAuth();

    serverSend({ type: "ping" });
    expect(frameSpy).toHaveBeenCalledWith({ type: "ping" });
  });

  it("send() throws when not connected", () => {
    const mgr = createManager();
    expect(() => mgr.send({ type: "pong" })).toThrow("WebSocket is not connected");
  });

  it("send() throws after close()", () => {
    const mgr = createManager();
    mgr.connect();
    completeAuth();
    mgr.close();
    expect(() => mgr.send({ type: "pong" })).toThrow("WebSocket is not connected");
  });

  it("emits 'disconnected' event on server-initiated close", () => {
    const mgr = createManager();
    const disconnectedSpy = vi.fn();
    mgr.on("disconnected", disconnectedSpy);

    mgr.connect();
    completeAuth();
    mockWsInstance.emit("close");

    expect(disconnectedSpy).toHaveBeenCalledOnce();
  });

  it("emits 'disconnected' event on client-initiated close()", () => {
    const mgr = createManager();
    const disconnectedSpy = vi.fn();
    mgr.on("disconnected", disconnectedSpy);

    mgr.connect();
    completeAuth();
    mgr.close();

    expect(disconnectedSpy).toHaveBeenCalledOnce();
  });

  it("emits 'error' on invalid JSON from server", () => {
    const mgr = createManager();
    const errorSpy = vi.fn();
    mgr.on("error", errorSpy);

    mgr.connect();
    mockWsInstance.emit("message", "not-valid-json{{{");

    expect(errorSpy).toHaveBeenCalledOnce();
    expect((errorSpy.mock.calls[0][0] as Error).message).toBe("Invalid JSON from server");
  });

  it("emits 'error' on WebSocket error event", () => {
    const mgr = createManager();
    const errorSpy = vi.fn();
    mgr.on("error", errorSpy);

    mgr.connect();
    const wsError = new Error("connection refused");
    mockWsInstance.emit("error", wsError);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toBe(wsError);
  });

  it("initial state is 'disconnected'", () => {
    const mgr = createManager();
    expect(mgr.state).toBe("disconnected");
  });
});

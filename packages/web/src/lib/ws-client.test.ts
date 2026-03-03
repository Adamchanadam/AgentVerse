/**
 * Tests for WsClient — browser WebSocket client.
 *
 * Mocks global.WebSocket to simulate server frames.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { WsClient, type WsClientState, type WsClientConfig } from "./ws-client.js";

// ── Mock WebSocket ──────────────────────────────────────────────

type WsHandler = {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
};

let mockWsInstance: WsHandler;

function setMockInstance(instance: WsHandler): void {
  mockWsInstance = instance;
}

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  readyState = 1; // OPEN

  constructor(_url: string) {
    setMockInstance(this);
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

const seed = ed25519.utils.randomPrivateKey();
const pubkey = ed25519.getPublicKey(seed);

function makeConfig(overrides?: Partial<WsClientConfig>): WsClientConfig {
  return {
    url: "ws://localhost:3000/ws",
    privateKeyHex: bytesToHex(seed),
    publicKeyHex: bytesToHex(pubkey),
    ...overrides,
  };
}

function serverSend(frame: unknown) {
  mockWsInstance.onmessage?.({ data: JSON.stringify(frame) });
}

// ── Tests ───────────────────────────────────────────────────────

describe("WsClient", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("transitions to connecting state on connect()", async () => {
    const states: WsClientState[] = [];
    const client = new WsClient({
      ...makeConfig(),
      onStateChange: (s) => states.push(s),
    });

    client.connect();
    expect(states).toContain("connecting");
    client.disconnect();
  });

  it("handles challenge → sends auth frame with correct signature", async () => {
    const client = new WsClient(makeConfig());
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    const nonceHex = "aa".repeat(32);
    serverSend({ type: "challenge", nonce: nonceHex });

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(mockWsInstance.send.mock.calls[0][0] as string) as {
      type: string;
      payload: { pubkey: string; sig: string };
    };
    expect(sent.type).toBe("auth");
    expect(sent.payload.pubkey).toBe(bytesToHex(pubkey));

    // Verify signature is valid
    const sig = hexToBytes(sent.payload.sig);
    const nonceBytes = hexToBytes(nonceHex);
    expect(ed25519.verify(sig, nonceBytes, pubkey)).toBe(true);

    client.disconnect();
  });

  it("transitions to connected on auth_ok", async () => {
    const states: WsClientState[] = [];
    const client = new WsClient({
      ...makeConfig(),
      onStateChange: (s) => states.push(s),
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    serverSend({ type: "challenge", nonce: "bb".repeat(32) });
    serverSend({
      type: "auth_ok",
      payload: { agent_id: "agent-1", server_time: new Date().toISOString() },
    });

    expect(states).toContain("connected");
    expect(client.state).toBe("connected");

    client.disconnect();
  });

  it("disconnects permanently on auth_error (no reconnect)", async () => {
    const states: WsClientState[] = [];
    const client = new WsClient({
      ...makeConfig(),
      onStateChange: (s) => states.push(s),
      onError: vi.fn(),
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    serverSend({ type: "challenge", nonce: "cc".repeat(32) });
    serverSend({ type: "auth_error", error: "invalid signature" });

    expect(client.state).toBe("disconnected");
    // Should NOT attempt reconnect
    await vi.advanceTimersByTimeAsync(60000);
    expect(states.filter((s) => s === "reconnecting").length).toBe(0);

    client.disconnect();
  });

  it("responds to ping with pong", async () => {
    const client = new WsClient(makeConfig());
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    serverSend({ type: "challenge", nonce: "dd".repeat(32) });
    serverSend({ type: "auth_ok", payload: { agent_id: "agent-1", server_time: "" } });

    mockWsInstance.send.mockClear();
    serverSend({ type: "ping" });

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(mockWsInstance.send.mock.calls[0][0] as string) as { type: string };
    expect(sent.type).toBe("pong");

    client.disconnect();
  });

  it("dispatches event frames to onEvent callback", async () => {
    const onEvent = vi.fn();
    const client = new WsClient({ ...makeConfig(), onEvent });
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    serverSend({ type: "challenge", nonce: "ee".repeat(32) });
    serverSend({ type: "auth_ok", payload: { agent_id: "agent-1", server_time: "" } });

    const testEnvelope = {
      event_id: "evt-1",
      event_type: "msg.relay",
      ts: new Date().toISOString(),
      sender_pubkey: "abc",
      recipient_ids: [],
      nonce: "nnn",
      sig: "sss",
      payload: { pair_id: "p1", ciphertext: "ct", ephemeral_pubkey: "ek" },
    };
    serverSend({ type: "event", payload: testEnvelope, server_seq: "42" });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(testEnvelope, "42");

    client.disconnect();
  });

  it("dispatches submit_result frames to onSubmitResult callback", async () => {
    const onSubmitResult = vi.fn();
    const client = new WsClient({ ...makeConfig(), onSubmitResult });
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    serverSend({ type: "challenge", nonce: "ff".repeat(32) });
    serverSend({ type: "auth_ok", payload: { agent_id: "agent-1", server_time: "" } });

    const result = {
      event_id: "evt-2",
      result_ts: new Date().toISOString(),
      status: "accepted",
    };
    serverSend({ type: "submit_result", payload: result });

    expect(onSubmitResult).toHaveBeenCalledTimes(1);
    expect(onSubmitResult).toHaveBeenCalledWith(result);

    client.disconnect();
  });
});

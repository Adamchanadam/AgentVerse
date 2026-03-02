/**
 * Integration tests for the WebSocket plugin orchestrator.
 *
 * Uses a real WebSocket connection against a Fastify server with
 * an in-memory pg-mem database.
 *
 * IMPORTANT: The @fastify/websocket handler fires immediately on upgrade,
 * so the server may send frames before the ws client "open" event fires.
 * All message listeners must be registered BEFORE awaiting the open event.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { type AddressInfo } from "net";
import WebSocket from "ws";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { signEnvelope, type WsFrame, type EventEnvelope } from "@agentverse/shared";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

// ─── Helpers ──────────────────────────────────────────────────

/** Collect frames from a WebSocket. Listeners are registered immediately. */
function createFrameCollector(ws: WebSocket) {
  const frames: WsFrame[] = [];
  const waiters: Array<{
    predicate: (f: WsFrame) => boolean;
    resolve: (f: WsFrame) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  ws.on("message", (data: WebSocket.RawData) => {
    const frame = JSON.parse(data.toString()) as WsFrame;
    frames.push(frame);

    // Check if any waiter matches
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.predicate(frame)) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(frame);
      }
    }
  });

  return {
    frames,
    waitFor(predicate: (f: WsFrame) => boolean, timeoutMs = 5000): Promise<WsFrame> {
      // Check already collected frames first
      const existing = frames.find(predicate);
      if (existing) return Promise.resolve(existing);

      return new Promise<WsFrame>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timeout waiting for frame (collected: ${frames.length})`)),
          timeoutMs,
        );
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
  };
}

/** Generate an Ed25519 keypair for testing. */
function generateTestKeypair() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    privateKey,
    publicKey,
  };
}

/** Connect a WebSocket and register frame collection before open. */
function connectWs(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const collector = createFrameCollector(ws);

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS open timeout")), 5000);
    ws.on("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return { ws, collector, ready };
}

/**
 * Full auth handshake helper: connect, receive challenge, sign nonce, send auth.
 * Returns the ws, collector, auth_ok frame, and keypair.
 */
async function authenticateWs(port: number) {
  const kp = generateTestKeypair();
  const { ws, collector, ready } = connectWs(port);

  // Wait for connection and challenge (challenge may arrive before open)
  await ready;

  const challenge = await collector.waitFor((f) => f.type === "challenge");
  if (challenge.type !== "challenge") throw new Error("Expected challenge frame");

  // Sign the nonce bytes (NOT the hex string)
  const nonceBytes = hexToBytes(challenge.nonce);
  const sig = ed25519.sign(nonceBytes, kp.privateKey);

  // Send auth
  ws.send(
    JSON.stringify({
      type: "auth",
      payload: {
        pubkey: kp.publicKeyHex,
        sig: bytesToHex(sig),
      },
    }),
  );

  // Wait for auth_ok
  const authOk = await collector.waitFor((f) => f.type === "auth_ok");
  if (authOk.type !== "auth_ok") throw new Error("Expected auth_ok frame");

  return { ws, collector, authOk, kp };
}

// ─── Test suite ───────────────────────────────────────────────

describe("ws-plugin integration", () => {
  let app: FastifyInstance;
  let port: number;

  beforeEach(async () => {
    const db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.listen({ port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await app.close();
  });

  it("completes challenge-response auth flow", async () => {
    const { ws, authOk } = await authenticateWs(port);

    expect(authOk.type).toBe("auth_ok");
    if (authOk.type === "auth_ok") {
      expect(authOk.payload.agent_id).toBeTruthy();
      expect(typeof authOk.payload.agent_id).toBe("string");
      expect(authOk.payload.server_time).toBeTruthy();
    }

    ws.close();
  });

  it("rejects auth with invalid signature", async () => {
    const kp = generateTestKeypair();
    const { ws, collector, ready } = connectWs(port);

    await ready;

    const challenge = await collector.waitFor((f) => f.type === "challenge");
    if (challenge.type !== "challenge") throw new Error("Expected challenge");

    // Send auth with an obviously bad signature (all zeros)
    ws.send(
      JSON.stringify({
        type: "auth",
        payload: {
          pubkey: kp.publicKeyHex,
          sig: "00".repeat(64),
        },
      }),
    );

    // Expect auth_error
    const errorFrame = await collector.waitFor((f) => f.type === "auth_error");
    expect(errorFrame.type).toBe("auth_error");
    if (errorFrame.type === "auth_error") {
      expect(errorFrame.error).toBeTruthy();
    }

    // Socket should be closed by the server
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        resolve();
      } else {
        ws.on("close", () => resolve());
      }
    });
  });

  it("handles submit_event and returns submit_result", async () => {
    const { ws, collector, authOk, kp } = await authenticateWs(port);
    if (authOk.type !== "auth_ok") throw new Error("Expected auth_ok");

    const agentId = authOk.payload.agent_id;

    // Build a signed agent.registered envelope
    const envelope: EventEnvelope = {
      event_id: crypto.randomUUID(),
      event_type: "agent.registered",
      ts: new Date().toISOString(),
      sender_pubkey: kp.publicKeyHex,
      recipient_ids: [agentId],
      nonce: bytesToHex(ed25519.utils.randomPrivateKey().slice(0, 16)),
      sig: "", // will be set below
      payload: {
        display_name: "Test Agent",
        persona_tags: ["test"],
        capabilities: [],
        visibility: "public",
      },
    };
    envelope.sig = signEnvelope(envelope, kp.privateKeyHex);

    // Send submit_event
    ws.send(
      JSON.stringify({
        type: "submit_event",
        payload: envelope,
      }),
    );

    // Wait for submit_result
    const result = await collector.waitFor((f) => f.type === "submit_result");
    expect(result.type).toBe("submit_result");
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("accepted");
      expect(result.payload.event_id).toBe(envelope.event_id);
      expect(result.payload.server_seq).toBeTruthy();
    }

    ws.close();
  });

  it("responds to pong without error", async () => {
    const { ws, collector } = await authenticateWs(port);

    // Send a pong frame (simulating a response to a server ping)
    ws.send(JSON.stringify({ type: "pong" }));

    // Send a consumer_ack (no-op) to verify the connection is still healthy
    ws.send(
      JSON.stringify({
        type: "consumer_ack",
        payload: { server_seq: "1", event_id: "test" },
      }),
    );

    // Wait a short time to see if any error frame arrives.
    // collector.waitFor rejects on timeout, so we catch it.
    const errorOrTimeout = await Promise.race([
      collector.waitFor((f) => f.type === "error", 500).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);

    // No error should have been received
    expect(errorOrTimeout).toBeNull();

    ws.close();
  });
});

/**
 * E2E test infrastructure — shared helpers for end-to-end integration tests.
 *
 * Provides:
 * - createE2EHub: start an in-process Hub with pg-mem
 * - connectAndAuth: connect WS client + complete challenge-response auth
 * - registerAgent: convenience to register an AgentCard via submit_event
 * - createSignedEnvelope: build + sign any EventEnvelope
 * - createFrameCollector: async predicate-based frame waiting
 *
 * Spec: tasks.md 18.1
 */

import { type FastifyInstance } from "fastify";
import { type AddressInfo } from "net";
import WebSocket from "ws";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";
import {
  signEnvelope,
  type WsFrame,
  type EventEnvelope,
  type EventPayload,
  type EventType,
} from "@agentverse/shared";
import { buildApp } from "../server/app.js";
import { createTestDb } from "../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../server/test-config.js";

// ─── Types ────────────────────────────────────────────────────

export interface TestKeypair {
  privateKeyHex: string;
  publicKeyHex: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface AuthenticatedAgent {
  ws: WebSocket;
  collector: FrameCollector;
  agentId: string;
  kp: TestKeypair;
}

export interface FrameCollector {
  frames: WsFrame[];
  waitFor: (predicate: (f: WsFrame) => boolean, timeoutMs?: number) => Promise<WsFrame>;
}

export interface E2EHub {
  app: FastifyInstance;
  port: number;
  close: () => Promise<void>;
}

// ─── Hub Factory ──────────────────────────────────────────────

export async function createE2EHub(): Promise<E2EHub> {
  const db = createTestDb();
  const app = buildApp(TEST_CONFIG, db);
  await app.listen({ port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  return {
    app,
    port,
    close: () => app.close(),
  };
}

// ─── Frame Collector ──────────────────────────────────────────

export function createFrameCollector(ws: WebSocket): FrameCollector {
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

// ─── Keypair ──────────────────────────────────────────────────

export function generateTestKeypair(): TestKeypair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    privateKey,
    publicKey,
  };
}

// ─── Connect + Auth ───────────────────────────────────────────

export interface ConnectOptions {
  kp?: TestKeypair;
  lastSeenServerSeq?: string;
}

export async function connectAndAuth(
  port: number,
  optsOrKp?: TestKeypair | ConnectOptions,
): Promise<AuthenticatedAgent> {
  // Support both legacy (kp only) and new options form
  const opts: ConnectOptions =
    optsOrKp && "publicKeyHex" in optsOrKp ? { kp: optsOrKp } : (optsOrKp ?? {});

  const keypair = opts.kp ?? generateTestKeypair();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const collector = createFrameCollector(ws);

  await new Promise<void>((resolve, reject) => {
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

  const challenge = await collector.waitFor((f) => f.type === "challenge");
  if (challenge.type !== "challenge") throw new Error("Expected challenge");

  const nonceBytes = hexToBytes(challenge.nonce);
  const sig = ed25519.sign(nonceBytes, keypair.privateKey);

  const authPayload: Record<string, string> = {
    pubkey: keypair.publicKeyHex,
    sig: bytesToHex(sig),
  };
  if (opts.lastSeenServerSeq !== undefined) {
    authPayload.last_seen_server_seq = opts.lastSeenServerSeq;
  }

  ws.send(JSON.stringify({ type: "auth", payload: authPayload }));

  const authOk = await collector.waitFor((f) => f.type === "auth_ok");
  if (authOk.type !== "auth_ok") throw new Error("Expected auth_ok");

  return {
    ws,
    collector,
    agentId: authOk.payload.agent_id,
    kp: keypair,
  };
}

// ─── Envelope Builder ─────────────────────────────────────────

export function createSignedEnvelope(
  kp: TestKeypair,
  eventType: EventType,
  payload: EventPayload,
  recipientIds: string[] = [],
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    ts: new Date().toISOString(),
    sender_pubkey: kp.publicKeyHex,
    recipient_ids: recipientIds,
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload,
  };
  envelope.sig = signEnvelope(envelope, kp.privateKeyHex);
  return envelope;
}

// ─── Register Agent ───────────────────────────────────────────

export async function registerAgent(
  agent: AuthenticatedAgent,
  displayName: string,
): Promise<string> {
  const envelope = createSignedEnvelope(
    agent.kp,
    "agent.registered",
    {
      display_name: displayName,
      persona_tags: ["e2e-test"],
      capabilities: [],
      visibility: "public",
    },
    [agent.agentId],
  );

  agent.ws.send(JSON.stringify({ type: "submit_event", payload: envelope }));

  const result = await agent.collector.waitFor((f) => f.type === "submit_result");
  if (result.type !== "submit_result" || result.payload.status !== "accepted") {
    throw new Error(`Registration failed: ${JSON.stringify(result)}`);
  }

  return result.payload.server_seq!;
}

// ─── Submit + Wait ────────────────────────────────────────────

export async function submitAndWait(
  agent: AuthenticatedAgent,
  envelope: EventEnvelope,
): Promise<WsFrame> {
  agent.ws.send(JSON.stringify({ type: "submit_event", payload: envelope }));
  return agent.collector.waitFor(
    (f) => f.type === "submit_result" && f.payload.event_id === envelope.event_id,
  );
}

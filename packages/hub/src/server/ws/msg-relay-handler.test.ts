/**
 * Unit tests for handleMsgRelay.
 *
 * Verifies:
 * 1. Accepts relay with active pairing (zero-persistence, no server_seq)
 * 2. Rejects relay with invalid signature
 * 3. Rejects relay when pairing is not active
 * 4. Stores offline message in TTL mode (server_seq returned)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { handleMsgRelay, type MsgRelayDeps } from "./msg-relay-handler.js";
import type { Db } from "../../db/index.js";

// ─── Test Helpers ──────────────────────────────────────────

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

// ─── Tests ─────────────────────────────────────────────────

describe("handleMsgRelay", () => {
  let db: Db;
  let eventRepo: EventRepository;
  let agentRepo: AgentRepository;
  let pairingRepo: PairingRepository;
  let offlineMsgRepo: OfflineMessageRepository;

  // Shared keypairs and pairing
  const senderKp = makeKeypair();
  const receiverKp = makeKeypair();
  let pairId: string;

  /** Create a properly signed msg.relay envelope. */
  function makeRelayEnvelope(): EventEnvelope {
    const payload = {
      pair_id: pairId,
      ciphertext: "dGVzdA==",
      ephemeral_pubkey: bytesToHex(randomBytes(32)),
    };
    const envelope: EventEnvelope = {
      event_id: randomUUID(),
      event_type: "msg.relay",
      ts: new Date().toISOString(),
      sender_pubkey: senderKp.pub,
      recipient_ids: [],
      nonce: bytesToHex(randomBytes(16)),
      sig: "",
      payload,
    };
    envelope.sig = signEnvelope(envelope, senderKp.priv);
    return envelope;
  }

  function makeDeps(ttlDays: number): MsgRelayDeps {
    return { eventRepo, agentRepo, pairingRepo, offlineMsgRepo, ttlDays };
  }

  beforeEach(async () => {
    db = createTestDb();
    eventRepo = new EventRepository(db);
    agentRepo = new AgentRepository(db);
    pairingRepo = new PairingRepository(db);
    offlineMsgRepo = new OfflineMessageRepository(db);

    // Create sender + receiver agents
    const sender = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Sender",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: senderKp.pub,
      level: 1,
      badges: [],
    });

    const receiver = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Receiver",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: receiverKp.pub,
      level: 1,
      badges: [],
    });

    // Create pairing and transition to active
    const pairing = await pairingRepo.create({
      agentAId: sender.id,
      agentBId: receiver.id,
    });
    await pairingRepo.transitionStatus(pairing.id, "pending", "active");
    pairId = pairing.id;
  });

  it("accepts relay with active pairing (zero-persistence)", async () => {
    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, makeDeps(0));

    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeUndefined();
    expect(result.event_id).toBe(envelope.event_id);
  });

  it("rejects relay with invalid signature", async () => {
    const envelope = makeRelayEnvelope();
    // Tamper with the signature
    envelope.sig = bytesToHex(randomBytes(64));

    const result = await handleMsgRelay(envelope, makeDeps(0));

    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("signature_invalid");
  });

  it("rejects relay when pairing is not active", async () => {
    // Revoke the pairing first
    await pairingRepo.transitionStatus(pairId, "active", "revoked");

    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, makeDeps(0));

    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("pair_not_active");
  });

  it("stores offline message in TTL mode", async () => {
    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, makeDeps(7));

    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeDefined();
    expect(typeof result.server_seq).toBe("string");
    expect(result.event_id).toBe(envelope.event_id);
  });
});

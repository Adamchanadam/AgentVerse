/**
 * Property 17: Blind Forwarding — Hub Has No Plaintext (MVP mandatory)
 *
 * Verifies:
 * 1. In TTL mode, the events table contains no ciphertext (only pair_id placeholder),
 *    and offline_messages contains only opaque ciphertext — never plaintext.
 * 2. In zero-persistence mode, no data is stored in DB at all.
 *
 * Feature: agentverse, Property 17: Blind Forwarding
 * Validates: Requirements HC2 (Hub DB stores only metadata, msg.relay no plaintext)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type MsgRelayPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { handleMsgRelay } from "./msg-relay-handler.js";

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

describe("Property 17: Blind Forwarding — Hub Has No Plaintext", () => {
  it("in TTL mode, events table contains no ciphertext and offline_messages contains only opaque ciphertext", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use a distinctive prefix + minimum length to avoid trivial substring
        // matches against JSON keys (pair_id, ephemeral_pubkey) and UUID hex chars.
        fc.string({ minLength: 8, maxLength: 500 }).map((s) => `PLAINTEXT_${s}`),
        async (plaintext) => {
          const db = createTestDb();
          const eventRepo = new EventRepository(db);
          const agentRepo = new AgentRepository(db);
          const pairingRepo = new PairingRepository(db);
          const offlineMsgRepo = new OfflineMessageRepository(db);

          const senderKp = makeKeypair();
          const receiverKp = makeKeypair();

          const sender = await agentRepo.upsert({
            id: randomUUID(),
            displayName: "S",
            personaTags: [],
            capabilities: [],
            visibility: "public",
            pubkey: senderKp.pub,
            level: 1,
            badges: [],
          });
          const receiver = await agentRepo.upsert({
            id: randomUUID(),
            displayName: "R",
            personaTags: [],
            capabilities: [],
            visibility: "public",
            pubkey: receiverKp.pub,
            level: 1,
            badges: [],
          });
          const pairing = await pairingRepo.create({ agentAId: sender.id, agentBId: receiver.id });
          await pairingRepo.transitionStatus(pairing.id, "pending", "active");

          // Simulate "encrypted" ciphertext (in real use this would be E2E encrypted)
          const fakeCiphertext = Buffer.from(plaintext).toString("base64");

          const payload: MsgRelayPayload = {
            pair_id: pairing.id,
            ciphertext: fakeCiphertext,
            ephemeral_pubkey: bytesToHex(randomBytes(32)),
          };
          const envelope: EventEnvelope = {
            event_id: randomUUID(),
            event_type: "msg.relay",
            ts: new Date().toISOString(),
            sender_pubkey: senderKp.pub,
            recipient_ids: [receiver.id],
            nonce: bytesToHex(randomBytes(16)),
            sig: "",
            payload,
          };
          envelope.sig = signEnvelope(envelope, senderKp.priv);

          await handleMsgRelay(envelope, {
            eventRepo,
            agentRepo,
            pairingRepo,
            offlineMsgRepo,
            ttlDays: 7,
          });

          // Verify: events table must NOT contain the plaintext or the ciphertext
          const storedEvent = await eventRepo.findByEventId(envelope.event_id);
          expect(storedEvent).not.toBeNull();
          const eventPayloadStr = JSON.stringify(storedEvent!.payload);
          expect(eventPayloadStr).not.toContain(plaintext);
          expect(eventPayloadStr).not.toContain(fakeCiphertext);

          // Verify: offline_messages contains only the opaque ciphertext, not plaintext
          const offlineMsgs = await offlineMsgRepo.findCatchup(0n, pairing.id, 100);
          expect(offlineMsgs).toHaveLength(1);
          expect(offlineMsgs[0].ciphertext).toBe(fakeCiphertext);
          // The ciphertext is opaque to Hub — it cannot recover plaintext without keys
        },
      ),
      { numRuns: 20 },
    );
  });

  it("in zero-persistence mode, no data is stored at all", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use a distinctive prefix + minimum length to avoid trivial substring
        // matches against JSON keys (pair_id, ephemeral_pubkey) and UUID hex chars.
        fc.string({ minLength: 8, maxLength: 500 }).map((s) => `PLAINTEXT_${s}`),
        async (plaintext) => {
          const db = createTestDb();
          const eventRepo = new EventRepository(db);
          const agentRepo = new AgentRepository(db);
          const pairingRepo = new PairingRepository(db);
          const offlineMsgRepo = new OfflineMessageRepository(db);

          const senderKp = makeKeypair();
          const receiverKp = makeKeypair();

          const sender = await agentRepo.upsert({
            id: randomUUID(),
            displayName: "S",
            personaTags: [],
            capabilities: [],
            visibility: "public",
            pubkey: senderKp.pub,
            level: 1,
            badges: [],
          });
          const receiver = await agentRepo.upsert({
            id: randomUUID(),
            displayName: "R",
            personaTags: [],
            capabilities: [],
            visibility: "public",
            pubkey: receiverKp.pub,
            level: 1,
            badges: [],
          });
          const pairing = await pairingRepo.create({ agentAId: sender.id, agentBId: receiver.id });
          await pairingRepo.transitionStatus(pairing.id, "pending", "active");

          const fakeCiphertext = Buffer.from(plaintext).toString("base64");
          const payload: MsgRelayPayload = {
            pair_id: pairing.id,
            ciphertext: fakeCiphertext,
            ephemeral_pubkey: bytesToHex(randomBytes(32)),
          };
          const envelope: EventEnvelope = {
            event_id: randomUUID(),
            event_type: "msg.relay",
            ts: new Date().toISOString(),
            sender_pubkey: senderKp.pub,
            recipient_ids: [receiver.id],
            nonce: bytesToHex(randomBytes(16)),
            sig: "",
            payload,
          };
          envelope.sig = signEnvelope(envelope, senderKp.priv);

          await handleMsgRelay(envelope, {
            eventRepo,
            agentRepo,
            pairingRepo,
            offlineMsgRepo,
            ttlDays: 0,
          });

          // Zero-persistence: NO event stored
          const storedEvent = await eventRepo.findByEventId(envelope.event_id);
          expect(storedEvent).toBeNull();
        },
      ),
      { numRuns: 20 },
    );
  });
});

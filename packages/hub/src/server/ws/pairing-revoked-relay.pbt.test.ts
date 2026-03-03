/**
 * Property 15: Revoked Pairing Stops msg.relay (MVP mandatory)
 *
 * Verifies:
 * msg.relay is ALWAYS rejected with `pair_not_active` after a pairing
 * has been revoked, regardless of the ciphertext content.
 *
 * Strategy:
 * Use fast-check to generate random ciphertext strings. For each:
 * 1. Create a fresh test DB
 * 2. Register two agents (A and B)
 * 3. Create pairing: pair.requested (A -> B)
 * 4. Approve: pair.approved
 * 5. Revoke: pair.revoked
 * 6. Attempt msg.relay with random ciphertext -> MUST be rejected with pair_not_active
 *
 * Feature: agentverse, Property 15: Revoked Stops msg.relay
 * Validates: Requirements HC3 (pairing revocation blocks relay)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import {
  signEnvelope,
  type EventEnvelope,
  type EventType,
  type AgentCardPayload,
  type PairRequestedPayload,
  type PairApprovedPayload,
  type PairRevokedPayload,
  type MsgRelayPayload,
} from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { handleSubmitEvent, type EventHandlerDeps } from "./event-handler.js";
import { handleMsgRelay, type MsgRelayDeps } from "./msg-relay-handler.js";
import { pairings } from "../../db/schema.js";

// ─── Helpers ────────────────────────────────────────────────

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

function makeSignedEnvelope(
  kp: { priv: string; pub: string },
  eventType: EventType,
  payload: Record<string, unknown>,
  recipientIds: string[] = [],
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: eventType,
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: recipientIds,
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: payload as unknown as EventEnvelope["payload"],
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

function makeAgentRegisteredEnvelope(kp: { priv: string; pub: string }): EventEnvelope {
  const payload: AgentCardPayload = {
    display_name: "TestAgent",
    persona_tags: ["test"],
    capabilities: [],
    visibility: "public",
  };
  return makeSignedEnvelope(kp, "agent.registered", payload as unknown as Record<string, unknown>);
}

function makePairRequestedEnvelope(
  kp: { priv: string; pub: string },
  targetAgentId: string,
): EventEnvelope {
  const payload: PairRequestedPayload = {
    target_agent_id: targetAgentId,
  };
  return makeSignedEnvelope(kp, "pair.requested", payload as unknown as Record<string, unknown>, [
    targetAgentId,
  ]);
}

function makePairApprovedEnvelope(
  kp: { priv: string; pub: string },
  pairId: string,
  requesterAgentId: string,
): EventEnvelope {
  const payload: PairApprovedPayload = {
    pair_id: pairId,
    requester_agent_id: requesterAgentId,
  };
  return makeSignedEnvelope(kp, "pair.approved", payload as unknown as Record<string, unknown>, [
    requesterAgentId,
  ]);
}

function makePairRevokedEnvelope(kp: { priv: string; pub: string }, pairId: string): EventEnvelope {
  const payload: PairRevokedPayload = {
    pair_id: pairId,
  };
  return makeSignedEnvelope(kp, "pair.revoked", payload as unknown as Record<string, unknown>);
}

// ─── P15: Revoked pairing stops msg.relay ───────────────────

describe("P15: Revoked pairing stops msg.relay", () => {
  it("msg.relay is always rejected after revocation", { timeout: 15_000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 200 }).map((s) => `CIPHERTEXT_${s}`),
        async (ciphertext) => {
          // 1. Fresh test DB + repos
          const db = createTestDb();
          const eventRepo = new EventRepository(db);
          const agentRepo = new AgentRepository(db);
          const pairingRepo = new PairingRepository(db);
          const offlineMsgRepo = new OfflineMessageRepository(db);

          const eventDeps: EventHandlerDeps = { eventRepo, agentRepo, pairingRepo };

          // 2. Register two agents
          const kpA = makeKeypair();
          const kpB = makeKeypair();

          const regA = await handleSubmitEvent(makeAgentRegisteredEnvelope(kpA), eventDeps);
          expect(regA.status).toBe("accepted");

          const regB = await handleSubmitEvent(makeAgentRegisteredEnvelope(kpB), eventDeps);
          expect(regB.status).toBe("accepted");

          // Get agent IDs from DB
          const agentA = await agentRepo.findByPubkey(kpA.pub);
          const agentB = await agentRepo.findByPubkey(kpB.pub);
          expect(agentA).not.toBeNull();
          expect(agentB).not.toBeNull();

          // 3. pair.requested: A requests B
          const reqResult = await handleSubmitEvent(
            makePairRequestedEnvelope(kpA, agentB!.id),
            eventDeps,
          );
          expect(reqResult.status).toBe("accepted");

          // Get pair ID from DB
          const rows = await db.select().from(pairings);
          expect(rows).toHaveLength(1);
          const pairId = rows[0].id;

          // 4. pair.approved: B approves
          const approveResult = await handleSubmitEvent(
            makePairApprovedEnvelope(kpB, pairId, agentA!.id),
            eventDeps,
          );
          expect(approveResult.status).toBe("accepted");

          // 5. pair.revoked: A revokes
          const revokeResult = await handleSubmitEvent(
            makePairRevokedEnvelope(kpA, pairId),
            eventDeps,
          );
          expect(revokeResult.status).toBe("accepted");

          // 6. Attempt msg.relay with random ciphertext
          const relayPayload: MsgRelayPayload = {
            pair_id: pairId,
            ciphertext: Buffer.from(ciphertext).toString("base64"),
            ephemeral_pubkey: bytesToHex(randomBytes(32)),
          };
          const relayEnvelope = makeSignedEnvelope(
            kpA,
            "msg.relay",
            relayPayload as unknown as Record<string, unknown>,
            [agentB!.id],
          );

          const relayDeps: MsgRelayDeps = {
            eventRepo,
            agentRepo,
            pairingRepo,
            offlineMsgRepo,
            ttlDays: 0,
          };

          const relayResult = await handleMsgRelay(relayEnvelope, relayDeps);

          // MUST be rejected with pair_not_active
          expect(relayResult.status).toBe("rejected");
          expect(relayResult.error?.code).toBe("pair_not_active");
        },
      ),
      { numRuns: 30 },
    );
  });
});

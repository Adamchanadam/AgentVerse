/**
 * Property-Based Test for pairing state machine legality (P14).
 *
 * Generates random sequences of pairing operations (requested, approved, revoked)
 * and verifies that only legal transitions succeed while illegal transitions are
 * rejected by the event handler.
 *
 * Legal transition map (per agent-pair relationship, not per pairing row):
 *   none    -> [requested]
 *   pending -> [approved, revoked]
 *   active  -> [revoked]
 *   revoked -> [requested]     (revoked clears the way for a new pairing cycle)
 *
 * Feature: agentverse, Property 14
 * Validates: Requirements 3.2 (pairing state machine), 3.3 (illegal transition rejection)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type AgentCardPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { handleSubmitEvent, type EventHandlerDeps } from "./event-handler.js";
import { pairings } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// ─── Legal transitions ─────────────────────────────────────

/**
 * Legal transitions from the perspective of the agent-pair relationship.
 *
 * Note: `revoked` is terminal for a *single pairing row*, but the system allows
 * a fresh `pair.requested` between the same two agents once no pending/active
 * pairing exists. So from the relationship perspective, `revoked` permits
 * `requested` (which creates a brand-new pairing and cycles back to `pending`).
 */
const LEGAL: Record<string, string[]> = {
  none: ["requested"],
  pending: ["approved", "revoked"],
  active: ["revoked"],
  revoked: ["requested"],
};

// ─── Helpers ────────────────────────────────────────────────

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

function makeAgentRegisteredEnvelope(kp: { priv: string; pub: string }): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "agent.registered",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: {
      display_name: "TestAgent",
      persona_tags: ["test"],
      capabilities: [],
      visibility: "public",
    } as AgentCardPayload,
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

/**
 * Build and submit a pairing operation event.
 *
 * - "requested": A requests to pair with B. sender = kpA
 * - "approved":  B approves the pairing.   sender = kpB
 * - "revoked":   A revokes the pairing.    sender = kpA
 */
async function submitPairOp(
  op: "requested" | "approved" | "revoked",
  kpA: { priv: string; pub: string },
  kpB: { priv: string; pub: string },
  agentAId: string,
  agentBId: string,
  pairId: string | null,
  deps: EventHandlerDeps,
) {
  let envelope: EventEnvelope;

  switch (op) {
    case "requested": {
      envelope = {
        event_id: randomUUID(),
        event_type: "pair.requested",
        ts: new Date().toISOString(),
        sender_pubkey: kpA.pub,
        recipient_ids: [agentBId],
        nonce: bytesToHex(randomBytes(16)),
        sig: "",
        payload: { target_agent_id: agentBId },
      };
      envelope.sig = signEnvelope(envelope, kpA.priv);
      break;
    }
    case "approved": {
      envelope = {
        event_id: randomUUID(),
        event_type: "pair.approved",
        ts: new Date().toISOString(),
        sender_pubkey: kpB.pub,
        recipient_ids: [],
        nonce: bytesToHex(randomBytes(16)),
        sig: "",
        payload: { pair_id: pairId ?? "nonexistent", requester_agent_id: agentAId },
      };
      envelope.sig = signEnvelope(envelope, kpB.priv);
      break;
    }
    case "revoked": {
      envelope = {
        event_id: randomUUID(),
        event_type: "pair.revoked",
        ts: new Date().toISOString(),
        sender_pubkey: kpA.pub,
        recipient_ids: [],
        nonce: bytesToHex(randomBytes(16)),
        sig: "",
        payload: { pair_id: pairId ?? "nonexistent" },
      };
      envelope.sig = signEnvelope(envelope, kpA.priv);
      break;
    }
  }

  return handleSubmitEvent(envelope, deps);
}

// ─── P14: Pairing State Machine Legality ────────────────────

describe("P14: Pairing state machine legality", () => {
  it(
    "only legal transitions succeed; illegal transitions are rejected",
    { timeout: 15_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom("requested" as const, "approved" as const, "revoked" as const), {
            minLength: 1,
            maxLength: 8,
          }),
          async (ops) => {
            // Fresh DB for each property run
            const db = createTestDb();
            const eventRepo = new EventRepository(db);
            const agentRepo = new AgentRepository(db);
            const pairingRepo = new PairingRepository(db);
            const deps: EventHandlerDeps = { eventRepo, agentRepo, pairingRepo };

            // Register two agents (A and B)
            const kpA = makeKeypair();
            const kpB = makeKeypair();

            const regA = await handleSubmitEvent(makeAgentRegisteredEnvelope(kpA), deps);
            expect(regA.status).toBe("accepted");

            const regB = await handleSubmitEvent(makeAgentRegisteredEnvelope(kpB), deps);
            expect(regB.status).toBe("accepted");

            // Retrieve agent IDs from DB
            const agentA = await agentRepo.findByPubkey(kpA.pub);
            const agentB = await agentRepo.findByPubkey(kpB.pub);
            expect(agentA).not.toBeNull();
            expect(agentB).not.toBeNull();
            const agentAId = agentA!.id;
            const agentBId = agentB!.id;

            let state = "none";
            let pairId: string | null = null;

            for (const op of ops) {
              const isLegal = LEGAL[state].includes(op);
              const result = await submitPairOp(op, kpA, kpB, agentAId, agentBId, pairId, deps);

              if (isLegal) {
                expect(result.status).toBe("accepted");

                // Update tracked state
                if (op === "requested") {
                  state = "pending";
                  // Retrieve the newest pending pairId from the DB
                  // (there may be older revoked rows from previous cycles)
                  const rows = await db
                    .select()
                    .from(pairings)
                    .where(eq(pairings.status, "pending"));
                  pairId = rows[0]?.id ?? null;
                  expect(pairId).not.toBeNull();
                }
                if (op === "approved") {
                  state = "active";
                }
                if (op === "revoked") {
                  state = "revoked";
                }
              } else {
                expect(result.status).toBe("rejected");
                // State remains unchanged
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

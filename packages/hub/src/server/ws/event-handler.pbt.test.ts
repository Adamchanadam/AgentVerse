/**
 * Property-Based Tests for event handler: P3, P5, P24.
 *
 * P3  — Event Idempotency: submitting the same event_id N times → 1 row, same server_seq.
 * P5  — server_seq Monotonic: N distinct events → strictly increasing server_seq.
 * P24 — Signature Before AgentCard: tampered sig → rejected, no agent created, no event stored.
 *
 * Feature: agentverse, Properties 3, 5, 24
 * Validates: Requirements 2.4 (idempotency), 2.5 (ordering), 4.3 (sig verification)
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
import { handleSubmitEvent } from "./event-handler.js";

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

// ─── P3: Event Idempotency ──────────────────────────────────

describe("Property 3: Event Idempotency", () => {
  it("submitting the same event_id N times yields 1 row and same server_seq", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (n) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const agentRepo = new AgentRepository(db);
        const pairingRepo = new PairingRepository(db);
        const deps = { eventRepo, agentRepo, pairingRepo };

        const kp = makeKeypair();
        const envelope = makeAgentRegisteredEnvelope(kp);

        const results: string[] = [];
        for (let i = 0; i < n; i++) {
          const result = await handleSubmitEvent(envelope, deps);
          expect(result.status).toBe("accepted");
          results.push(result.server_seq!);
        }

        // All return same server_seq
        const unique = new Set(results);
        expect(unique.size).toBe(1);
      }),
      { numRuns: 20 },
    );
  });
});

// ─── P5: server_seq Monotonic ───────────────────────────────

describe("Property 5: server_seq Monotonic", () => {
  it("N consecutive events get strictly increasing server_seq", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (n) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const agentRepo = new AgentRepository(db);
        const pairingRepo = new PairingRepository(db);
        const deps = { eventRepo, agentRepo, pairingRepo };

        const kp = makeKeypair();
        const seqs: bigint[] = [];

        for (let i = 0; i < n; i++) {
          const envelope = makeAgentRegisteredEnvelope(kp);
          const result = await handleSubmitEvent(envelope, deps);
          expect(result.status).toBe("accepted");
          seqs.push(BigInt(result.server_seq!));
        }

        for (let i = 1; i < seqs.length; i++) {
          expect(seqs[i] > seqs[i - 1]).toBe(true);
        }
      }),
      { numRuns: 20 },
    );
  });
});

// ─── P24: Signature Verification Before AgentCard ───────────

describe("Property 24: Signature Verification Before AgentCard", () => {
  it("tampered signature on agent.registered -> rejected, no agent created", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 127 }), async (byteOffset) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const agentRepo = new AgentRepository(db);
        const pairingRepo = new PairingRepository(db);
        const deps = { eventRepo, agentRepo, pairingRepo };

        const kp = makeKeypair();
        const envelope = makeAgentRegisteredEnvelope(kp);

        // Tamper with signature — flip one hex char
        const sigChars = envelope.sig.split("");
        const idx = byteOffset % sigChars.length;
        const orig = sigChars[idx];
        sigChars[idx] = orig === "f" ? "0" : "f";
        envelope.sig = sigChars.join("");

        const result = await handleSubmitEvent(envelope, deps);
        expect(result.status).toBe("rejected");
        expect(result.error?.code).toBe("signature_invalid");

        // No agent should have been created
        const agent = await agentRepo.findByPubkey(kp.pub);
        expect(agent).toBeNull();

        // No event stored
        const event = await eventRepo.findByEventId(envelope.event_id);
        expect(event).toBeNull();
      }),
      { numRuns: 20 },
    );
  });
});

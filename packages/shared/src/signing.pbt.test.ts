/**
 * Property 2: Signing Tampering Detection (MVP 必做)
 *
 * For any validly signed EventEnvelope:
 * - Mutating any "covered" field (event_id, event_type, ts, nonce, or payload)
 *   MUST cause verifyEnvelope() to return false.
 *
 * "Covered" fields are those included in the signing message:
 *   sortedKeyJSON({ event_id, event_type, nonce, payload_hash, ts })
 *   where payload_hash = hex(SHA-256(sortedKeyJSON(payload)))
 *
 * "Uncovered" fields (sig, sender_pubkey, recipient_ids) are NOT in scope here.
 *
 * Feature: agentverse, Property 2: Signing Tampering Detection
 * Validates: Requirements 4.2, 4.3
 */

import { describe, it } from "vitest";
import fc from "fast-check";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import type { EventEnvelope, EventType, AgentCardPayload } from "./types.js";
import { signEnvelope, verifyEnvelope } from "./signing.js";

// ─── Test Keypair ───────────────────────────────────────────────
// Same deterministic vector as signing.test.ts
const TEST_PRIV_HEX = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae3d55";
const TEST_PUB_HEX = bytesToHex(ed25519.getPublicKey(TEST_PRIV_HEX));

// ─── Arbitraries ───────────────────────────────────────────────

const hexArb = fc.hexaString({ minLength: 2, maxLength: 64 });
const uuidArb = fc.uuid();

const agentCardPayloadArb = fc.record({
  display_name: fc.string({ minLength: 1, maxLength: 50 }),
  persona_tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  capabilities: fc.array(
    fc.record({ name: fc.string({ minLength: 1 }), version: fc.string({ minLength: 1 }) }),
    { maxLength: 3 },
  ),
  visibility: fc.constantFrom("public" as const, "paired_only" as const, "private" as const),
});

const pairRequestedPayloadArb = fc.record({
  target_agent_id: uuidArb,
  message: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
});

const pairApprovedPayloadArb = fc.record({
  pair_id: uuidArb,
  requester_agent_id: uuidArb,
});

const pairRevokedPayloadArb = fc.record({
  pair_id: uuidArb,
  reason: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
});

const msgRelayPayloadArb = fc.record({
  pair_id: uuidArb,
  ciphertext: fc.base64String({ minLength: 4, maxLength: 200 }),
  ephemeral_pubkey: hexArb,
});

const typedPayloadArb: fc.Arbitrary<{ event_type: EventType; payload: EventEnvelope["payload"] }> =
  fc.oneof(
    agentCardPayloadArb.map((p) => ({ event_type: "agent.registered" as EventType, payload: p })),
    agentCardPayloadArb.map((p) => ({ event_type: "agent.updated" as EventType, payload: p })),
    pairRequestedPayloadArb.map((p) => ({
      event_type: "pair.requested" as EventType,
      payload: p,
    })),
    pairApprovedPayloadArb.map((p) => ({
      event_type: "pair.approved" as EventType,
      payload: p,
    })),
    pairRevokedPayloadArb.map((p) => ({
      event_type: "pair.revoked" as EventType,
      payload: p,
    })),
    msgRelayPayloadArb.map((p) => ({ event_type: "msg.relay" as EventType, payload: p })),
  );

/** Generate a fully signed EventEnvelope using the test keypair. */
const signedEnvelopeArb: fc.Arbitrary<EventEnvelope> = fc
  .tuple(
    uuidArb,
    typedPayloadArb,
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    fc.array(fc.string({ minLength: 1, maxLength: 36 }), { maxLength: 5 }),
    hexArb,
  )
  .map(([event_id, { event_type, payload }, date, recipient_ids, nonce]) => {
    const unsigned: EventEnvelope = {
      event_id,
      event_type,
      ts: date.toISOString(),
      sender_pubkey: TEST_PUB_HEX,
      recipient_ids,
      nonce,
      sig: "",
      payload,
    };
    const sig = signEnvelope(unsigned, TEST_PRIV_HEX);
    return { ...unsigned, sig };
  });

/** Generate a fully signed AgentCard envelope (payload is always AgentCardPayload). */
const signedAgentCardEnvelopeArb: fc.Arbitrary<EventEnvelope & { payload: AgentCardPayload }> = fc
  .tuple(
    uuidArb,
    agentCardPayloadArb,
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    fc.array(fc.string({ minLength: 1, maxLength: 36 }), { maxLength: 5 }),
    hexArb,
    fc.constantFrom("agent.registered" as EventType, "agent.updated" as EventType),
  )
  .map(([event_id, payload, date, recipient_ids, nonce, event_type]) => {
    const unsigned: EventEnvelope = {
      event_id,
      event_type,
      ts: date.toISOString(),
      sender_pubkey: TEST_PUB_HEX,
      recipient_ids,
      nonce,
      sig: "",
      payload,
    };
    const sig = signEnvelope(unsigned, TEST_PRIV_HEX);
    return { ...unsigned, sig } as EventEnvelope & { payload: AgentCardPayload };
  });

// ─── Helpers ────────────────────────────────────────────────────

/** Return a guaranteed-different EventType for tampering. */
function differentEventType(t: EventType): EventType {
  return t === "agent.registered" ? "agent.updated" : "agent.registered";
}

/** Flip the first hex digit to a different character. */
function flipHexFirst(hex: string): string {
  const first = hex[0] === "a" ? "b" : "a";
  return first + hex.slice(1);
}

// ─── Property Tests ─────────────────────────────────────────────

describe("Property 2: Signing Tampering Detection", () => {
  it("tampering event_id invalidates signature", () => {
    fc.assert(
      fc.property(signedEnvelopeArb, (signed) => {
        const tampered = { ...signed, event_id: signed.event_id + "tamper" };
        return verifyEnvelope(tampered) === false;
      }),
      { numRuns: 100 },
    );
  });

  it("tampering event_type invalidates signature", () => {
    fc.assert(
      fc.property(signedEnvelopeArb, (signed) => {
        const tampered = { ...signed, event_type: differentEventType(signed.event_type) };
        return verifyEnvelope(tampered) === false;
      }),
      { numRuns: 100 },
    );
  });

  it("tampering ts invalidates signature", () => {
    fc.assert(
      fc.property(signedEnvelopeArb, (signed) => {
        // Append a character — always different from any valid ISO timestamp
        const tampered = { ...signed, ts: signed.ts + "X" };
        return verifyEnvelope(tampered) === false;
      }),
      { numRuns: 100 },
    );
  });

  it("tampering nonce invalidates signature", () => {
    fc.assert(
      fc.property(signedEnvelopeArb, (signed) => {
        const tampered = { ...signed, nonce: flipHexFirst(signed.nonce) };
        return verifyEnvelope(tampered) === false;
      }),
      { numRuns: 100 },
    );
  });

  it("tampering AgentCard payload invalidates signature", () => {
    fc.assert(
      fc.property(signedAgentCardEnvelopeArb, (signed) => {
        const tamperedPayload: AgentCardPayload = {
          ...signed.payload,
          display_name: signed.payload.display_name + "_tampered",
        };
        return verifyEnvelope({ ...signed, payload: tamperedPayload }) === false;
      }),
      { numRuns: 100 },
    );
  });

  it("simultaneous tamper of all covered fields invalidates signature", () => {
    fc.assert(
      fc.property(signedAgentCardEnvelopeArb, (signed) => {
        const tampered: EventEnvelope = {
          ...signed,
          event_id: signed.event_id + "X",
          event_type: differentEventType(signed.event_type),
          ts: signed.ts + "X",
          nonce: flipHexFirst(signed.nonce),
          payload: { ...signed.payload, display_name: signed.payload.display_name + "_t" },
        };
        return verifyEnvelope(tampered) === false;
      }),
      { numRuns: 100 },
    );
  });
});

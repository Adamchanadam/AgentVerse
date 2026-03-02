/**
 * Property 1: Event Envelope 序列化 Round-Trip (MVP 必做)
 *
 * For any valid EventEnvelope, serialize → deserialize SHALL produce
 * an equivalent object (all field values identical).
 *
 * Feature: agentverse, Property 1: Event Envelope 序列化 Round-Trip
 * Validates: Requirements 25.2
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { EventEnvelope, EventType } from "./types.js";
import { serializeEnvelope, deserializeEnvelope } from "./envelope.js";

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

/** Generate a typed (event_type, payload) pair */
const typedPayloadArb: fc.Arbitrary<{ event_type: EventType; payload: EventEnvelope["payload"] }> =
  fc.oneof(
    agentCardPayloadArb.map((p) => ({
      event_type: "agent.registered" as EventType,
      payload: p,
    })),
    agentCardPayloadArb.map((p) => ({
      event_type: "agent.updated" as EventType,
      payload: p,
    })),
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
    msgRelayPayloadArb.map((p) => ({
      event_type: "msg.relay" as EventType,
      payload: p,
    })),
  );

/** Generate a complete valid EventEnvelope */
const eventEnvelopeArb: fc.Arbitrary<EventEnvelope> = fc
  .tuple(
    uuidArb,
    typedPayloadArb,
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    hexArb,
    fc.array(fc.string({ minLength: 1, maxLength: 36 }), { minLength: 1, maxLength: 5 }),
    hexArb,
    hexArb,
  )
  .map(([event_id, { event_type, payload }, date, sender_pubkey, recipient_ids, nonce, sig]) => ({
    event_id,
    event_type,
    ts: date.toISOString(),
    sender_pubkey,
    recipient_ids,
    nonce,
    sig,
    payload,
  }));

// ─── Property Test ─────────────────────────────────────────────

describe("Property 1: Event Envelope Round-Trip", () => {
  it("serialize → deserialize produces equivalent object", () => {
    fc.assert(
      fc.property(eventEnvelopeArb, (envelope) => {
        const json = serializeEnvelope(envelope);
        const restored = deserializeEnvelope(json);

        // Deep equality: all fields must match
        expect(restored.event_id).toBe(envelope.event_id);
        expect(restored.event_type).toBe(envelope.event_type);
        expect(restored.ts).toBe(envelope.ts);
        expect(restored.sender_pubkey).toBe(envelope.sender_pubkey);
        expect(restored.recipient_ids).toEqual(envelope.recipient_ids);
        expect(restored.nonce).toBe(envelope.nonce);
        expect(restored.sig).toBe(envelope.sig);
        expect(restored.payload).toEqual(envelope.payload);
      }),
      { numRuns: 100 },
    );
  });

  it("serialization is deterministic (same input → same output)", () => {
    fc.assert(
      fc.property(eventEnvelopeArb, (envelope) => {
        const json1 = serializeEnvelope(envelope);
        const json2 = serializeEnvelope(envelope);
        expect(json1).toBe(json2);
      }),
      { numRuns: 100 },
    );
  });
});

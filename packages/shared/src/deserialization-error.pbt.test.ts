/**
 * Property 21: 反序列化錯誤報告 (Deserialization Error Reporting)
 *
 * For any payload that does NOT conform to the EventEnvelope JSON schema,
 * deserialization SHALL return descriptive errors containing the violated
 * schema rule and field path.
 *
 * Feature: agentverse, Property 21: 反序列化錯誤報告
 * Validates: Requirements 25.4
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deserializeEnvelope, EnvelopeValidationError } from "./envelope.js";

// ─── Helpers ───────────────────────────────────────────────────

/** A structurally valid envelope base (all required fields present & correct types) */
function validEnvelopeBase() {
  return {
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: "pair.requested",
    ts: "2026-02-28T12:00:00.000Z",
    sender_pubkey: "aabbccdd",
    recipient_ids: ["agent-b"],
    nonce: "deadbeef01020304",
    sig: "cafebabe",
    payload: { target_agent_id: "550e8400-e29b-41d4-a716-446655440001" },
  };
}

const REQUIRED_ENVELOPE_FIELDS = [
  "event_id",
  "event_type",
  "ts",
  "sender_pubkey",
  "recipient_ids",
  "nonce",
  "sig",
  "payload",
] as const;

const VALID_EVENT_TYPES = [
  "agent.registered",
  "agent.updated",
  "pair.requested",
  "pair.approved",
  "pair.revoked",
  "msg.relay",
] as const;

// ─── Arbitraries for invalid payloads ──────────────────────────

/** Generate a non-string primitive to replace a string field */
const nonStringArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 3 }),
);

/** Generate a non-array value to replace an array field */
const nonArrayArb = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer(), { maxKeys: 3 }),
);

/** Generate a non-object value to replace the payload field */
const nonObjectArb = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 3 }),
);

/** Generate an invalid event_type string (not in the valid enum) */
const invalidEventTypeArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !(VALID_EVENT_TYPES as readonly string[]).includes(s));

// ─── Property Test ─────────────────────────────────────────────

describe("Property 21: 反序列化錯誤報告 (Deserialization Error Reporting)", () => {
  it("missing required envelope field → error with field path", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REQUIRED_ENVELOPE_FIELDS), (fieldToRemove) => {
        const obj = validEnvelopeBase();
        delete (obj as Record<string, unknown>)[fieldToRemove];
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          // Should not reach here
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          // At least one issue should reference the missing field
          const hasFieldPath = err.issues.some(
            (issue) => issue.path === fieldToRemove || issue.path.includes(fieldToRemove),
          );
          expect(hasFieldPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("wrong type for string fields → error with field path", () => {
    const stringFields = ["event_id", "ts", "sender_pubkey", "nonce", "sig"] as const;

    fc.assert(
      fc.property(fc.constantFrom(...stringFields), nonStringArb, (field, badValue) => {
        const obj = { ...validEnvelopeBase(), [field]: badValue };
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          const hasFieldPath = err.issues.some(
            (issue) => issue.path === field || issue.path.includes(field),
          );
          expect(hasFieldPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("wrong type for recipient_ids (non-array) → error with field path", () => {
    fc.assert(
      fc.property(nonArrayArb, (badValue) => {
        const obj = { ...validEnvelopeBase(), recipient_ids: badValue };
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          const hasFieldPath = err.issues.some(
            (issue) => issue.path === "recipient_ids" || issue.path.includes("recipient_ids"),
          );
          expect(hasFieldPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("invalid event_type → error with field path", () => {
    fc.assert(
      fc.property(invalidEventTypeArb, (badType) => {
        const obj = { ...validEnvelopeBase(), event_type: badType };
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          const hasFieldPath = err.issues.some(
            (issue) => issue.path === "event_type" || issue.path.includes("event_type"),
          );
          expect(hasFieldPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("non-object payload → error with field path", () => {
    fc.assert(
      fc.property(nonObjectArb, (badPayload) => {
        const obj = { ...validEnvelopeBase(), payload: badPayload };
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          const hasFieldPath = err.issues.some(
            (issue) => issue.path === "payload" || issue.path.includes("payload"),
          );
          expect(hasFieldPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("payload missing required fields for event_type → error with payload.* path", () => {
    // For each event_type, provide an empty payload object (missing required fields)
    const eventTypesWithEmptyPayload = VALID_EVENT_TYPES.map((et) => ({
      event_type: et,
      payload: {},
    }));

    fc.assert(
      fc.property(fc.constantFrom(...eventTypesWithEmptyPayload), ({ event_type, payload }) => {
        const obj = { ...validEnvelopeBase(), event_type, payload };
        const json = JSON.stringify(obj);

        try {
          deserializeEnvelope(json);
          expect.fail("Expected EnvelopeValidationError");
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          expect(err.issues.length).toBeGreaterThan(0);
          // Errors should reference payload sub-fields
          const hasPayloadPath = err.issues.some((issue) => issue.path.startsWith("payload"));
          expect(hasPayloadPath).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("completely random non-envelope JSON → descriptive error with issues", () => {
    // Generate arbitrary JSON values that are very unlikely to be valid envelopes
    const arbitraryJsonArb = fc.oneof(
      fc.integer(),
      fc.string({ maxLength: 50 }),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.anything({ maxDepth: 1 }), { maxLength: 5 }),
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.oneof(fc.integer(), fc.string({ maxLength: 20 }), fc.boolean(), fc.constant(null)),
        { maxKeys: 5 },
      ),
    );

    fc.assert(
      fc.property(arbitraryJsonArb, (value) => {
        const json = JSON.stringify(value);

        try {
          deserializeEnvelope(json);
          // If it somehow passes (extremely unlikely), that's fine — skip
        } catch (e) {
          expect(e).toBeInstanceOf(EnvelopeValidationError);
          const err = e as EnvelopeValidationError;
          // Must have at least one issue with a descriptive message
          expect(err.issues.length).toBeGreaterThan(0);
          for (const issue of err.issues) {
            expect(typeof issue.path).toBe("string");
            expect(typeof issue.message).toBe("string");
            expect(issue.message.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

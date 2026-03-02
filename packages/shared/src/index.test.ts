import { describe, it, expect } from "vitest";
import type { EventEnvelope, WsFrame } from "./index.js";
import {
  serializeEnvelope,
  deserializeEnvelope,
  validateEnvelope,
  EnvelopeValidationError,
  validateEventEnvelope,
  validateWsFrame,
  EventEnvelopeSchema,
  WsFrameSchema,
  prettyEnvelope,
  prettyFrame,
} from "./index.js";

// ─── Helpers ───────────────────────────────────────────────────

function makeEnvelope(overrides?: Partial<EventEnvelope>): EventEnvelope {
  return {
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: "pair.requested",
    ts: "2026-02-28T12:00:00.000Z",
    sender_pubkey: "aabbccdd",
    recipient_ids: ["agent-b"],
    nonce: "deadbeef01020304",
    sig: "cafebabe",
    payload: {
      target_agent_id: "550e8400-e29b-41d4-a716-446655440001",
    },
    ...overrides,
  };
}

// ─── EventEnvelopeSchema ───────────────────────────────────────

describe("EventEnvelopeSchema", () => {
  it("accepts a valid pair.requested envelope", () => {
    expect(EventEnvelopeSchema.safeParse(makeEnvelope()).success).toBe(true);
  });

  it("rejects unknown event_type", () => {
    const r = EventEnvelopeSchema.safeParse(makeEnvelope({ event_type: "unknown.type" as never }));
    expect(r.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(EventEnvelopeSchema.safeParse("not an object").success).toBe(false);
  });
});

// ─── validateEventEnvelope ─────────────────────────────────────

describe("validateEventEnvelope", () => {
  it("returns success for valid envelope", () => {
    const r = validateEventEnvelope(makeEnvelope());
    expect(r.success).toBe(true);
  });

  it("returns failure with field paths for invalid input", () => {
    const r = validateEventEnvelope({ event_id: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });
});

// ─── Serialization round-trip ──────────────────────────────────

describe("serializeEnvelope / deserializeEnvelope", () => {
  it("round-trips a valid envelope", () => {
    const original = makeEnvelope();
    const json = serializeEnvelope(original);
    const restored = deserializeEnvelope(json);
    expect(restored).toEqual(original);
  });

  it("throws EnvelopeValidationError for invalid JSON", () => {
    expect(() => deserializeEnvelope("{bad json")).toThrow(EnvelopeValidationError);
  });

  it("throws with field paths for schema violations", () => {
    try {
      deserializeEnvelope(JSON.stringify({ event_id: 123 }));
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvelopeValidationError);
      expect((e as EnvelopeValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

// ─── validateEnvelope ──────────────────────────────────────────

describe("validateEnvelope", () => {
  it("returns validated envelope for valid input", () => {
    const result = validateEnvelope(makeEnvelope());
    expect(result.event_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws for invalid input", () => {
    expect(() => validateEnvelope({ bad: true })).toThrow(EnvelopeValidationError);
  });
});

// ─── WsFrameSchema ─────────────────────────────────────────────

describe("WsFrameSchema", () => {
  it("accepts submit_event frame (no server_seq)", () => {
    const frame: WsFrame = { type: "submit_event", payload: makeEnvelope() };
    expect(WsFrameSchema.safeParse(frame).success).toBe(true);
  });

  it("accepts event frame (with server_seq)", () => {
    const frame: WsFrame = { type: "event", payload: makeEnvelope(), server_seq: "42" };
    expect(WsFrameSchema.safeParse(frame).success).toBe(true);
  });

  it("accepts submit_result frame", () => {
    const frame: WsFrame = {
      type: "submit_result",
      payload: {
        server_seq: "42",
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        result_ts: "2026-02-28T12:00:00.000Z",
        status: "accepted",
      },
    };
    expect(WsFrameSchema.safeParse(frame).success).toBe(true);
  });

  it("accepts consumer_ack frame", () => {
    const frame: WsFrame = {
      type: "consumer_ack",
      payload: { server_seq: "42", event_id: "550e8400-e29b-41d4-a716-446655440000" },
    };
    expect(WsFrameSchema.safeParse(frame).success).toBe(true);
  });

  it("accepts ping/pong/catchup frames", () => {
    expect(WsFrameSchema.safeParse({ type: "ping" }).success).toBe(true);
    expect(WsFrameSchema.safeParse({ type: "pong" }).success).toBe(true);
    expect(WsFrameSchema.safeParse({ type: "catchup_start", from_seq: "0" }).success).toBe(true);
    expect(WsFrameSchema.safeParse({ type: "catchup_end" }).success).toBe(true);
  });

  it("accepts auth flow frames", () => {
    expect(WsFrameSchema.safeParse({ type: "challenge", nonce: "abc123" }).success).toBe(true);
    expect(
      WsFrameSchema.safeParse({ type: "auth", payload: { pubkey: "aa", sig: "bb" } }).success,
    ).toBe(true);
    expect(
      WsFrameSchema.safeParse({
        type: "auth_ok",
        payload: { agent_id: "a1", server_time: "2026-01-01T00:00:00.000Z" },
      }).success,
    ).toBe(true);
    expect(WsFrameSchema.safeParse({ type: "auth_error", error: "bad" }).success).toBe(true);
  });

  it("rejects unknown frame type", () => {
    expect(WsFrameSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });
});

// ─── validateWsFrame ───────────────────────────────────────────

describe("validateWsFrame", () => {
  it("returns success for valid frame", () => {
    expect(validateWsFrame({ type: "ping" }).success).toBe(true);
  });

  it("returns failure for invalid frame", () => {
    expect(validateWsFrame({ type: "unknown" }).success).toBe(false);
  });
});

// ─── Pretty-printer ────────────────────────────────────────────

describe("prettyEnvelope", () => {
  it("returns a compact summary string", () => {
    const output = prettyEnvelope(makeEnvelope());
    expect(output).toContain("[pair.requested]");
    expect(output).toContain("550e8400");
  });
});

describe("prettyFrame", () => {
  it("formats a ping frame", () => {
    expect(prettyFrame({ type: "ping" })).toBe("[ping]");
  });

  it("formats a submit_event frame", () => {
    const output = prettyFrame({ type: "submit_event", payload: makeEnvelope() });
    expect(output).toContain("[submit_event]");
    expect(output).toContain("[pair.requested]");
  });
});

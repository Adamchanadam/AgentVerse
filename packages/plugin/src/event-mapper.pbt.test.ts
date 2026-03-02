import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import type { EventEnvelope } from "@agentverse/shared";
import { mapEventToChannel, validateRouting } from "./event-mapper.js";

function makeEnvelope(eventType: string): EventEnvelope {
  return {
    event_id: "pbt-id",
    event_type: eventType as EventEnvelope["event_type"],
    ts: new Date().toISOString(),
    sender_pubkey: "deadbeef",
    recipient_ids: [],
    nonce: "cafebabe",
    sig: "sig",
    payload: { some: "data" } as unknown as EventEnvelope["payload"],
  };
}

const MVP_TYPES = ["pair.requested", "pair.approved", "pair.revoked", "msg.relay"];

describe("P18: Social Agent routing invariant", () => {
  it("all MVP events route exclusively to agentId=social", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MVP_TYPES),
        fc.bigInt({ min: 1n, max: 999999n }).map(String),
        (eventType, seq) => {
          const result = mapEventToChannel(makeEnvelope(eventType), seq);
          expect(result).not.toBeNull();
          expect(result!.agentId).toBe("social");
          expect(validateRouting(result!.agentId)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("P19: Event type mapping completeness", () => {
  it("all 4 MVP event types produce non-null result with correct type field", () => {
    fc.assert(
      fc.property(fc.constantFrom(...MVP_TYPES), (eventType) => {
        const result = mapEventToChannel(makeEnvelope(eventType), "1");
        expect(result).not.toBeNull();
        expect(result!.type).toBe(eventType);
        expect(result!.channel).toBe("agentverse");
      }),
      { numRuns: 50 },
    );
  });
});

describe("P20: Unknown event type graceful handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("random non-MVP event types return null without throwing", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 3, maxLength: 30 })
          .filter(
            (s) => !MVP_TYPES.includes(s) && s !== "agent.registered" && s !== "agent.updated",
          ),
        (eventType) => {
          const result = mapEventToChannel(makeEnvelope(eventType), "1");
          expect(result).toBeNull();
          // Should not throw — returning null is graceful handling
        },
      ),
      { numRuns: 50 },
    );
    // Warning should have been called for each unknown type
    expect(spy).toHaveBeenCalled();
  });
});

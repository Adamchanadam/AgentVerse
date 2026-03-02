import { describe, it, expect, vi, afterEach } from "vitest";
import type { EventEnvelope } from "@agentverse/shared";
import { mapEventToChannel, validateRouting } from "./event-mapper.js";

function makeEnvelope(eventType: string): EventEnvelope {
  return {
    event_id: "test-id",
    event_type: eventType as EventEnvelope["event_type"],
    ts: new Date().toISOString(),
    sender_pubkey: "deadbeef",
    recipient_ids: [],
    nonce: "cafebabe",
    sig: "sig",
    payload: { some: "data" } as unknown as EventEnvelope["payload"],
  };
}

describe("mapEventToChannel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes pair.requested to social agent", () => {
    const result = mapEventToChannel(makeEnvelope("pair.requested"), "1");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("social");
    expect(result!.channel).toBe("agentverse");
    expect(result!.type).toBe("pair.requested");
    expect(result!.serverSeq).toBe("1");
  });

  it("routes pair.approved to social agent", () => {
    const result = mapEventToChannel(makeEnvelope("pair.approved"), "2");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("social");
  });

  it("routes pair.revoked to social agent", () => {
    const result = mapEventToChannel(makeEnvelope("pair.revoked"), "3");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("social");
  });

  it("routes msg.relay to social agent", () => {
    const result = mapEventToChannel(makeEnvelope("msg.relay"), "4");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("social");
  });

  it("returns null for agent.registered (metadata, not routed)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = mapEventToChannel(makeEnvelope("agent.registered"), "5");
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled(); // known type, no warning
  });

  it("returns null for agent.updated (metadata, not routed)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = mapEventToChannel(makeEnvelope("agent.updated"), "6");
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null and logs warning for unknown event type", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = mapEventToChannel(makeEnvelope("some.unknown.type"), "7");
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("some.unknown.type"));
  });
});

describe("validateRouting", () => {
  it("returns true for 'social'", () => {
    expect(validateRouting("social")).toBe(true);
  });
  it("returns false for any other agentId", () => {
    expect(validateRouting("other")).toBe(false);
    expect(validateRouting("")).toBe(false);
  });
});

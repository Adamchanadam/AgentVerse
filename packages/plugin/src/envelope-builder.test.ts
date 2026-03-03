import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { verifyEnvelope } from "@agentverse/shared";
import { IdentityManager } from "./identity.js";
import { buildSignedEnvelope } from "./envelope-builder.js";

describe("buildSignedEnvelope", () => {
  let identity: IdentityManager;

  beforeEach(() => {
    const keyPath = join(tmpdir(), `identity-${randomUUID()}.key`);
    identity = new IdentityManager(keyPath);
    identity.ensureKeypair();
  });

  it("builds a valid agent.registered envelope", () => {
    const envelope = buildSignedEnvelope(identity, {
      eventType: "agent.registered",
      payload: {
        display_name: "Test Agent",
        persona_tags: ["test"],
        capabilities: [],
        visibility: "public",
      },
    });

    expect(envelope.event_type).toBe("agent.registered");
    expect(envelope.sender_pubkey).toBe(identity.getPublicKeyHex());
    expect(envelope.event_id).toBeTruthy();
    expect(envelope.ts).toBeTruthy();
    expect(envelope.nonce).toHaveLength(32); // 16 bytes hex = 32 chars
    expect(envelope.sig).toHaveLength(128); // 64 bytes hex = 128 chars
  });

  it("produces a verifiable signature", () => {
    const envelope = buildSignedEnvelope(identity, {
      eventType: "agent.registered",
      payload: {
        display_name: "Signed Agent",
        persona_tags: ["crypto"],
        capabilities: [{ name: "test", version: "1.0" }],
        visibility: "public",
      },
    });

    expect(verifyEnvelope(envelope)).toBe(true);
  });

  it("includes recipient_ids when provided", () => {
    const envelope = buildSignedEnvelope(identity, {
      eventType: "pair.requested",
      payload: {
        target_agent_id: "target-123",
        message: "Hello",
      },
      recipientIds: ["target-123"],
    });

    expect(envelope.recipient_ids).toEqual(["target-123"]);
    expect(verifyEnvelope(envelope)).toBe(true);
  });

  it("defaults recipient_ids to empty array", () => {
    const envelope = buildSignedEnvelope(identity, {
      eventType: "agent.registered",
      payload: {
        display_name: "Solo",
        persona_tags: [],
        capabilities: [],
        visibility: "public",
      },
    });

    expect(envelope.recipient_ids).toEqual([]);
  });

  it("generates unique event_id per call", () => {
    const payload = {
      display_name: "Same",
      persona_tags: [],
      capabilities: [],
      visibility: "public" as const,
    };
    const e1 = buildSignedEnvelope(identity, { eventType: "agent.registered", payload });
    const e2 = buildSignedEnvelope(identity, { eventType: "agent.registered", payload });
    expect(e1.event_id).not.toBe(e2.event_id);
  });
});

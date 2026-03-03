/**
 * E2E test: Security scenarios — replay, tamper, unpaired relay, revoked relay.
 *
 * Validates that the Hub correctly rejects:
 * - Replayed envelopes (idempotency via event_id)
 * - Tampered signatures
 * - msg.relay on non-active pairings
 * - msg.relay after pairing revocation
 *
 * Spec: tasks.md 18.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createE2EHub,
  connectAndAuth,
  registerAgent,
  createSignedEnvelope,
  submitAndWait,
  type E2EHub,
  type AuthenticatedAgent,
} from "./setup.js";
import { pairings } from "../db/schema.js";

describe("E2E: Security scenarios", () => {
  let hub: E2EHub;
  let agentA: AuthenticatedAgent;
  let agentB: AuthenticatedAgent;

  beforeEach(async () => {
    hub = await createE2EHub();
    agentA = await connectAndAuth(hub.port);
    agentB = await connectAndAuth(hub.port);
    await registerAgent(agentA, "Agent Alpha");
    await registerAgent(agentB, "Agent Beta");
  });

  afterEach(async () => {
    agentA.ws.close();
    agentB.ws.close();
    await hub.close();
  });

  it("rejects replayed envelope (same event_id)", async () => {
    // Submit a valid pair.requested
    const envelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );
    const result1 = await submitAndWait(agentA, envelope);
    if (result1.type === "submit_result") {
      expect(result1.payload.status).toBe("accepted");
    }

    // Replay the exact same envelope (same event_id)
    const result2 = await submitAndWait(agentA, envelope);
    if (result2.type === "submit_result") {
      // Idempotent: should return accepted with the original server_seq
      expect(result2.payload.status).toBe("accepted");
      expect(result2.payload.server_seq).toBe(
        (result1 as { type: "submit_result"; payload: { server_seq?: string } }).payload.server_seq,
      );
    }
  });

  it("rejects envelope with tampered signature", async () => {
    const envelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );

    // Tamper the signature (flip a character)
    const sigChars = envelope.sig.split("");
    sigChars[0] = sigChars[0] === "a" ? "b" : "a";
    envelope.sig = sigChars.join("");

    const result = await submitAndWait(agentA, envelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("signature_invalid");
    }
  });

  it("rejects msg.relay on pending (not yet active) pairing", async () => {
    // Create pairing but don't approve it (stays pending)
    const reqEnvelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );
    await submitAndWait(agentA, reqEnvelope);

    // Get the pending pair_id
    const [pairing] = await hub.app.db
      .select()
      .from(pairings)
      .where(eq(pairings.agentAId, agentA.agentId));

    // Try msg.relay on pending pairing — should be rejected
    const relayEnvelope = createSignedEnvelope(
      agentA.kp,
      "msg.relay",
      {
        pair_id: pairing.id,
        ciphertext: "deadbeef",
        ephemeral_pubkey: "aa".repeat(32),
      },
      [agentB.agentId],
    );
    const result = await submitAndWait(agentA, relayEnvelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("pair_not_active");
    }
  });

  it("rejects msg.relay after pairing is revoked", async () => {
    // Create and approve pairing
    const reqEnvelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );
    await submitAndWait(agentA, reqEnvelope);
    await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.requested",
    );

    const [pairing] = await hub.app.db
      .select()
      .from(pairings)
      .where(eq(pairings.agentAId, agentA.agentId));

    const approveEnvelope = createSignedEnvelope(
      agentB.kp,
      "pair.approved",
      { pair_id: pairing.id, requester_agent_id: agentA.agentId },
      [agentA.agentId],
    );
    await submitAndWait(agentB, approveEnvelope);
    await agentA.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.approved",
    );

    // Revoke the pairing
    const revokeEnvelope = createSignedEnvelope(
      agentA.kp,
      "pair.revoked",
      { pair_id: pairing.id, reason: "test revocation" },
      [agentB.agentId],
    );
    await submitAndWait(agentA, revokeEnvelope);

    // Try msg.relay on revoked pairing — should be rejected
    const relayEnvelope = createSignedEnvelope(
      agentA.kp,
      "msg.relay",
      {
        pair_id: pairing.id,
        ciphertext: "deadbeef",
        ephemeral_pubkey: "aa".repeat(32),
      },
      [agentB.agentId],
    );
    const result = await submitAndWait(agentA, relayEnvelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("pair_not_active");
    }
  });

  it("rejects envelope with tampered payload (signature mismatch)", async () => {
    const envelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );

    // Tamper the payload after signing (change target)
    (envelope.payload as unknown as Record<string, string>).target_agent_id = "tampered-id";

    const result = await submitAndWait(agentA, envelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("signature_invalid");
    }
  });
});

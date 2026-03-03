/**
 * E2E test: Pairing flow — two agents register, request pairing, approve.
 *
 * Flow: Agent A registers → Agent B registers → A sends pair.requested →
 *       B sends pair.approved → verify both agents receive events.
 *
 * Spec: tasks.md 18.2
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

describe("E2E: Pairing flow", () => {
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

  it("completes pair.requested → pair.approved flow", async () => {
    // Agent A sends pair.requested to Agent B
    const pairRequestEnvelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId, message: "Let's pair!" },
      [agentB.agentId],
    );
    const requestResult = await submitAndWait(agentA, pairRequestEnvelope);
    expect(requestResult.type).toBe("submit_result");
    if (requestResult.type === "submit_result") {
      expect(requestResult.payload.status).toBe("accepted");
    }

    // Agent B should receive the pair.requested event
    const pairEvent = await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.requested",
    );
    expect(pairEvent.type).toBe("event");
    if (pairEvent.type === "event") {
      expect(pairEvent.payload.event_type).toBe("pair.requested");
      expect(pairEvent.server_seq).toBeTruthy();
    }

    // Query DB for the actual pair_id (Hub generates a randomUUID server-side)
    const [pairing] = await hub.app.db
      .select()
      .from(pairings)
      .where(eq(pairings.agentAId, agentA.agentId));
    expect(pairing).toBeTruthy();
    const pairId = pairing.id;

    // Agent B sends pair.approved
    const approveEnvelope = createSignedEnvelope(
      agentB.kp,
      "pair.approved",
      { pair_id: pairId, requester_agent_id: agentA.agentId },
      [agentA.agentId],
    );
    const approveResult = await submitAndWait(agentB, approveEnvelope);
    expect(approveResult.type).toBe("submit_result");
    if (approveResult.type === "submit_result") {
      expect(approveResult.payload.status).toBe("accepted");
    }

    // Agent A should receive the pair.approved event
    const approveEvent = await agentA.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.approved",
    );
    expect(approveEvent.type).toBe("event");
  });

  it("rejects duplicate pairing request", async () => {
    // First request
    const envelope1 = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );
    const result1 = await submitAndWait(agentA, envelope1);
    if (result1.type === "submit_result") {
      expect(result1.payload.status).toBe("accepted");
    }

    // Duplicate request (same pair, different event_id)
    const envelope2 = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId },
      [agentB.agentId],
    );
    const result2 = await submitAndWait(agentA, envelope2);
    if (result2.type === "submit_result") {
      expect(result2.payload.status).toBe("rejected");
      expect(result2.payload.error?.code).toBe("pair_duplicate");
    }
  });

  it("rejects pair.approved for non-existent pairing", async () => {
    const envelope = createSignedEnvelope(
      agentB.kp,
      "pair.approved",
      { pair_id: "nonexistent-pair", requester_agent_id: agentA.agentId },
      [agentA.agentId],
    );
    const result = await submitAndWait(agentB, envelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
    }
  });
});

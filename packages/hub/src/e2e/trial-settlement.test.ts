/**
 * E2E test: Trial settlement flow — register, pair, create trial, settle with dual sigs.
 *
 * Flow: Register 2 agents → pair → approve → create trial → start trial →
 *       build verdict → dual-sign → submit trials.reported → verify settlement.
 *
 * Spec: PROJECT_MASTER_SPEC §16.4, tasks.md 25.6
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { signVerdict, type Verdict, type SignedVerdict } from "@agentverse/shared";
import {
  createE2EHub,
  connectAndAuth,
  registerAgent,
  createSignedEnvelope,
  submitAndWait,
  type E2EHub,
  type AuthenticatedAgent,
} from "./setup.js";
import { pairings, trials, trialResults, agentStats } from "../db/schema.js";

describe("E2E: Trial settlement flow", () => {
  let hub: E2EHub;
  let agentA: AuthenticatedAgent;
  let agentB: AuthenticatedAgent;
  let pairId: string;

  beforeEach(async () => {
    hub = await createE2EHub();
    agentA = await connectAndAuth(hub.port);
    agentB = await connectAndAuth(hub.port);
    await registerAgent(agentA, "Agent Alpha");
    await registerAgent(agentB, "Agent Beta");

    // Pair the agents: A requests, B approves
    const pairReq = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId, message: "Let's brawl!" },
      [agentB.agentId],
    );
    await submitAndWait(agentA, pairReq);

    // Get pair_id from DB
    const [pairing] = await hub.app.db
      .select()
      .from(pairings)
      .where(eq(pairings.agentAId, agentA.agentId));
    pairId = pairing.id;

    // Approve pairing
    const approveEnvelope = createSignedEnvelope(
      agentB.kp,
      "pair.approved",
      { pair_id: pairId, requester_agent_id: agentA.agentId },
      [agentA.agentId],
    );
    await submitAndWait(agentB, approveEnvelope);
  });

  afterEach(async () => {
    agentA.ws.close();
    agentB.ws.close();
    await hub.close();
  });

  it("full settlement: create trial → start → report → settled", async () => {
    const seed = "ab".repeat(32);

    // 1. Agent A submits trials.created
    const trialsCreatedEnvelope = createSignedEnvelope(
      agentA.kp,
      "trials.created",
      {
        pair_id: pairId,
        rule_id: "fw_hello",
        seed,
      },
      [agentB.agentId],
    );
    const createResult = await submitAndWait(agentA, trialsCreatedEnvelope);
    expect(createResult.type).toBe("submit_result");
    if (createResult.type === "submit_result") {
      expect(createResult.payload.status).toBe("accepted");
    }

    // 2. Both agents should receive trials.started auto-broadcast
    const startedA = await agentA.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "trials.started",
    );
    expect(startedA.type).toBe("event");
    if (startedA.type === "event") {
      expect(startedA.payload.payload).toHaveProperty("trial_id");
      expect(startedA.payload.payload).toHaveProperty("rule_payload");
    }

    const startedB = await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "trials.started",
    );
    expect(startedB.type).toBe("event");

    // 3. Verify trial transitioned to "started" in DB
    const trialRows = await hub.app.db.select().from(trials).where(eq(trials.pairId, pairId));
    expect(trialRows.length).toBe(1);
    expect(trialRows[0].status).toBe("started");
    expect(trialRows[0].ruleId).toBe("fw_hello");
    const trialId = trialRows[0].id;

    // 4. Both agents build identical Verdict and sign
    const verdict: Verdict = {
      match_id: trialId,
      winner_agent_id: agentA.agentId,
      loser_agent_id: agentB.agentId,
      rule_id: "fw_hello",
      trigger_event_id: crypto.randomUUID(),
      transcript_digest: "deadbeef".repeat(8),
    };

    const signedVerdict: SignedVerdict = {
      verdict,
      sig_winner: signVerdict(verdict, agentA.kp.privateKeyHex),
      sig_loser: signVerdict(verdict, agentB.kp.privateKeyHex),
    };

    // 5. Agent A submits trials.reported with SignedVerdict
    const reportedEnvelope = createSignedEnvelope(
      agentA.kp,
      "trials.reported",
      {
        trial_id: trialId,
        signed_verdict: signedVerdict,
      },
      [agentB.agentId],
    );
    const reportResult = await submitAndWait(agentA, reportedEnvelope);
    expect(reportResult.type).toBe("submit_result");
    if (reportResult.type === "submit_result") {
      expect(reportResult.payload.status).toBe("accepted");
    }

    // 6. Both agents should receive trials.settled broadcast
    const settledA = await agentA.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "trials.settled",
    );
    expect(settledA.type).toBe("event");
    if (settledA.type === "event") {
      expect(settledA.payload.payload).toMatchObject({
        trial_id: trialId,
        winner_agent_id: agentA.agentId,
        loser_agent_id: agentB.agentId,
        xp_winner: 100,
        xp_loser: 25,
      });
    }

    const settledB = await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "trials.settled",
    );
    expect(settledB.type).toBe("event");

    // 7. Verify trial status is "settled" in DB
    const [settledTrial] = await hub.app.db.select().from(trials).where(eq(trials.id, trialId));
    expect(settledTrial.status).toBe("settled");

    // 8. Verify trial_results row
    const [result] = await hub.app.db
      .select()
      .from(trialResults)
      .where(eq(trialResults.trialId, trialId));
    expect(result).toBeTruthy();
    expect(result.winnerAgentId).toBe(agentA.agentId);
    expect(result.loserAgentId).toBe(agentB.agentId);
    expect(result.xpWinner).toBe(100);
    expect(result.xpLoser).toBe(25);

    // 9. Verify agent_stats
    const [winnerStats] = await hub.app.db
      .select()
      .from(agentStats)
      .where(eq(agentStats.agentId, agentA.agentId));
    expect(winnerStats).toBeTruthy();
    expect(winnerStats.wins).toBe(1);
    expect(winnerStats.xp).toBe(100);

    const [loserStats] = await hub.app.db
      .select()
      .from(agentStats)
      .where(eq(agentStats.agentId, agentB.agentId));
    expect(loserStats).toBeTruthy();
    expect(loserStats.losses).toBe(1);
    expect(loserStats.xp).toBe(25);
  });

  it("rejects trials.created with invalid rule_id", async () => {
    const envelope = createSignedEnvelope(
      agentA.kp,
      "trials.created",
      {
        pair_id: pairId,
        rule_id: "nonexistent_rule",
        seed: "cc".repeat(32),
      },
      [agentB.agentId],
    );
    const result = await submitAndWait(agentA, envelope);
    expect(result.type).toBe("submit_result");
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("trial_rule_invalid");
    }
  });

  it("rejects trials.created with non-active pairing", async () => {
    // Revoke the pairing first
    const revokeEnvelope = createSignedEnvelope(agentA.kp, "pair.revoked", { pair_id: pairId }, [
      agentB.agentId,
    ]);
    await submitAndWait(agentA, revokeEnvelope);

    const envelope = createSignedEnvelope(
      agentA.kp,
      "trials.created",
      {
        pair_id: pairId,
        rule_id: "fw_hello",
        seed: "dd".repeat(32),
      },
      [agentB.agentId],
    );
    const result = await submitAndWait(agentA, envelope);
    expect(result.type).toBe("submit_result");
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("trial_pair_invalid");
    }
  });
});

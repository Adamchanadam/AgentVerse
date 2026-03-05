/**
 * Unit tests for settleTrialReport — dual-signature verdict verification.
 * Spec: PROJECT_MASTER_SPEC §16.4
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signVerdict, type Verdict, type SignedVerdict } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { TrialsRepository } from "../../db/repositories/trials.repository.js";
import { TrialResultsRepository } from "../../db/repositories/trial-results.repository.js";
import { AgentStatsRepository } from "../../db/repositories/agent-stats.repository.js";
import {
  settleTrialReport,
  type SettlementDeps,
  BADGE_FIRST_MATCH,
  BADGE_FIRST_WIN,
  BADGE_FIRST_DEFENSE,
} from "./settlement-handler.js";
import type { Db } from "../../db/index.js";

// ─── Test helpers ─────────────────────────────────────────────

function makeKeypair() {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  return { privHex: bytesToHex(priv), pubHex: bytesToHex(pub) };
}

let db: Db;
let agentRepo: AgentRepository;
let trialsRepo: TrialsRepository;
let trialResultsRepo: TrialResultsRepository;
let agentStatsRepo: AgentStatsRepository;
let deps: SettlementDeps;

let winnerKeys: { privHex: string; pubHex: string };
let loserKeys: { privHex: string; pubHex: string };
let winnerId: string;
let loserId: string;
let trialId: string;

beforeEach(async () => {
  db = createTestDb();
  agentRepo = new AgentRepository(db);
  const pairingRepo = new PairingRepository(db);
  trialsRepo = new TrialsRepository(db);
  trialResultsRepo = new TrialResultsRepository(db);
  agentStatsRepo = new AgentStatsRepository(db);

  winnerKeys = makeKeypair();
  loserKeys = makeKeypair();

  const winner = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Winner",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: winnerKeys.pubHex,
    level: 1,
    badges: [],
  });
  const loser = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Loser",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: loserKeys.pubHex,
    level: 1,
    badges: [],
  });
  winnerId = winner.id;
  loserId = loser.id;

  const pairing = await pairingRepo.create({ agentAId: winnerId, agentBId: loserId });
  await pairingRepo.transitionStatus(pairing.id, "pending", "active");

  const trial = await trialsRepo.createTrial({
    pairId: pairing.id,
    ruleId: "fw_hello",
    rulePayload: {},
    seed: "ab".repeat(32),
    createdBy: winnerId,
  });
  await trialsRepo.transitionStatus(trial.id, "created", "started");
  trialId = trial.id;

  deps = {
    trialsRepo,
    trialResultsRepo,
    agentStatsRepo,
    agentRepo,
    getAgentPubkey: async (agentId: string) => {
      const agent = await agentRepo.findById(agentId);
      return agent?.pubkey ?? null;
    },
  };
});

function makeVerdict(overrides?: Partial<Verdict>): Verdict {
  return {
    match_id: trialId,
    winner_agent_id: winnerId,
    loser_agent_id: loserId,
    rule_id: "fw_hello",
    trigger_event_id: randomUUID(),
    transcript_digest: "deadbeef".repeat(8),
    ...overrides,
  };
}

function signBoth(verdict: Verdict): SignedVerdict {
  return {
    verdict,
    sig_winner: signVerdict(verdict, winnerKeys.privHex),
    sig_loser: signVerdict(verdict, loserKeys.privHex),
  };
}

describe("settleTrialReport", () => {
  it("happy path: valid dual-signed verdict → settled", async () => {
    const verdict = makeVerdict();
    const signed = signBoth(verdict);
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trialId).toBe(trialId);
    expect(result.winnerId).toBe(winnerId);
    expect(result.loserId).toBe(loserId);
    expect(result.xpWinner).toBe(100);
    expect(result.xpLoser).toBe(25);

    // Verify DB state
    const trial = await trialsRepo.getTrial(trialId);
    expect(trial?.status).toBe("settled");

    const trialResult = await trialResultsRepo.getByTrialId(trialId);
    expect(trialResult).not.toBeNull();
    expect(trialResult!.winnerAgentId).toBe(winnerId);

    const winnerStats = await agentStatsRepo.getStats(winnerId);
    expect(winnerStats!.wins).toBe(1);
    expect(winnerStats!.xp).toBe(100);

    const loserStats = await agentStatsRepo.getStats(loserId);
    expect(loserStats!.losses).toBe(1);
    expect(loserStats!.xp).toBe(25);
  });

  it("trial not found → error", async () => {
    const verdict = makeVerdict({ match_id: randomUUID() });
    const signed = signBoth(verdict);
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("trial_not_found");
  });

  it("trial in wrong state (created) → error", async () => {
    // Create a new trial but don't transition to started
    const pairingRepo = new PairingRepository(db);
    const pairing2 = await pairingRepo.create({ agentAId: winnerId, agentBId: loserId });
    await pairingRepo.transitionStatus(pairing2.id, "pending", "active");
    const trial2 = await trialsRepo.createTrial({
      pairId: pairing2.id,
      ruleId: "fw_hello",
      rulePayload: {},
      seed: "cc".repeat(32),
      createdBy: winnerId,
    });

    const verdict = makeVerdict({ match_id: trial2.id });
    const signed = signBoth(verdict);
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_state");
  });

  it("trial already settled → error", async () => {
    // Settle first
    const verdict1 = makeVerdict();
    await settleTrialReport(signBoth(verdict1), deps);

    // Try again
    const verdict2 = makeVerdict();
    const result = await settleTrialReport(signBoth(verdict2), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_state");
  });

  it("winner sig invalid → sig_mismatch", async () => {
    const verdict = makeVerdict();
    const signed: SignedVerdict = {
      verdict,
      sig_winner: "aa".repeat(64), // garbage sig
      sig_loser: signVerdict(verdict, loserKeys.privHex),
    };
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sig_mismatch");
  });

  it("loser sig invalid → sig_mismatch", async () => {
    const verdict = makeVerdict();
    const signed: SignedVerdict = {
      verdict,
      sig_winner: signVerdict(verdict, winnerKeys.privHex),
      sig_loser: "bb".repeat(64), // garbage sig
    };
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sig_mismatch");
  });

  it("winner agent not found → error", async () => {
    const verdict = makeVerdict({ winner_agent_id: randomUUID() });
    const signed = signBoth(verdict);
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("agent_not_found");
  });

  it("tampered verdict (different content in sig) → sig_mismatch", async () => {
    const originalVerdict = makeVerdict();
    const signed = signBoth(originalVerdict);
    // Tamper the verdict after signing
    signed.verdict = { ...originalVerdict, rule_id: "tampered_rule" };
    const result = await settleTrialReport(signed, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sig_mismatch");
  });
});

describe("badge grants on settlement", () => {
  it("first match: both agents get badge_first_match", async () => {
    const verdict = makeVerdict();
    const result = await settleTrialReport(signBoth(verdict), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.badgesGranted[winnerId]).toContain(BADGE_FIRST_MATCH);
    expect(result.badgesGranted[loserId]).toContain(BADGE_FIRST_MATCH);

    // Verify persisted
    const winnerAgent = await agentRepo.findById(winnerId);
    expect(winnerAgent!.badges).toContain(BADGE_FIRST_MATCH);
    const loserAgent = await agentRepo.findById(loserId);
    expect(loserAgent!.badges).toContain(BADGE_FIRST_MATCH);
  });

  it("first win: winner gets badge_first_win", async () => {
    const verdict = makeVerdict();
    const result = await settleTrialReport(signBoth(verdict), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.badgesGranted[winnerId]).toContain(BADGE_FIRST_WIN);
    // Loser should NOT get first_win
    expect(result.badgesGranted[loserId] ?? []).not.toContain(BADGE_FIRST_WIN);
  });

  it("rule trigger: winner gets badge_first_defense", async () => {
    // Non-timeout trigger_event_id
    const verdict = makeVerdict({ trigger_event_id: randomUUID() });
    const result = await settleTrialReport(signBoth(verdict), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.badgesGranted[winnerId]).toContain(BADGE_FIRST_DEFENSE);
  });

  it("timeout forfeit: winner does NOT get badge_first_defense", async () => {
    const verdict = makeVerdict({ trigger_event_id: "timeout" });
    const result = await settleTrialReport(signBoth(verdict), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.badgesGranted[winnerId] ?? []).not.toContain(BADGE_FIRST_DEFENSE);
  });

  it("no duplicate badges on second settlement", async () => {
    // First settlement
    const verdict1 = makeVerdict();
    const result1 = await settleTrialReport(signBoth(verdict1), deps);
    expect(result1.ok).toBe(true);

    // Create new trial for second settlement
    const pairingRepo = new PairingRepository(db);
    const pairing2 = await pairingRepo.create({ agentAId: winnerId, agentBId: loserId });
    await pairingRepo.transitionStatus(pairing2.id, "pending", "active");
    const trial2 = await trialsRepo.createTrial({
      pairId: pairing2.id,
      ruleId: "fw_hello",
      rulePayload: {},
      seed: "dd".repeat(32),
      createdBy: winnerId,
    });
    await trialsRepo.transitionStatus(trial2.id, "created", "started");

    const verdict2 = makeVerdict({ match_id: trial2.id });
    const result2 = await settleTrialReport(signBoth(verdict2), deps);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    // Second settlement should not grant any badges (already have them all)
    expect(Object.keys(result2.badgesGranted).length).toBe(0);

    // Verify no duplicates in DB
    const winnerAgent = await agentRepo.findById(winnerId);
    const badgeCounts = new Map<string, number>();
    for (const b of winnerAgent!.badges) {
      badgeCounts.set(b, (badgeCounts.get(b) ?? 0) + 1);
    }
    for (const [, cnt] of badgeCounts) {
      expect(cnt).toBe(1);
    }
  });
});

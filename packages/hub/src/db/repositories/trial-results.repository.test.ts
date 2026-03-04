import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { PairingRepository } from "./pairing.repository.js";
import { TrialsRepository } from "./trials.repository.js";
import { TrialResultsRepository } from "./trial-results.repository.js";
import type { Db } from "../index.js";

let db: Db;
let repo: TrialResultsRepository;
let trialId: string;
let agentAId: string;
let agentBId: string;

beforeEach(async () => {
  db = createTestDb();
  const agentRepo = new AgentRepository(db);
  const pairingRepo = new PairingRepository(db);
  const trialsRepo = new TrialsRepository(db);
  repo = new TrialResultsRepository(db);

  const a = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "AgentA",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: "aaa" + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  });
  const b = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "AgentB",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: "bbb" + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  });
  agentAId = a.id;
  agentBId = b.id;

  const pairing = await pairingRepo.create({ agentAId, agentBId });
  await pairingRepo.transitionStatus(pairing.id, "pending", "active");

  const trial = await trialsRepo.createTrial({
    pairId: pairing.id,
    ruleId: "fw_hello",
    rulePayload: {},
    seed: "ab".repeat(32),
    createdBy: agentAId,
  });
  trialId = trial.id;
});

describe("TrialResultsRepository", () => {
  const makeResult = () => ({
    trialId,
    winnerAgentId: agentAId,
    loserAgentId: agentBId,
    ruleId: "fw_hello",
    triggerEventId: randomUUID(),
    transcriptDigest: "deadbeef".repeat(8),
    sigWinner: "aa".repeat(64),
    sigLoser: "bb".repeat(64),
  });

  it("creates a trial result", async () => {
    const result = await repo.createResult(makeResult());
    expect(result.trialId).toBe(trialId);
    expect(result.winnerAgentId).toBe(agentAId);
    expect(result.loserAgentId).toBe(agentBId);
  });

  it("defaults xpWinner=100 and xpLoser=25", async () => {
    const result = await repo.createResult(makeResult());
    expect(result.xpWinner).toBe(100);
    expect(result.xpLoser).toBe(25);
  });

  it("allows custom xp values", async () => {
    const result = await repo.createResult({ ...makeResult(), xpWinner: 200, xpLoser: 50 });
    expect(result.xpWinner).toBe(200);
    expect(result.xpLoser).toBe(50);
  });

  it("getByTrialId returns the result", async () => {
    await repo.createResult(makeResult());
    const found = await repo.getByTrialId(trialId);
    expect(found).not.toBeNull();
    expect(found!.trialId).toBe(trialId);
  });

  it("getByTrialId returns null for unknown trial", async () => {
    const found = await repo.getByTrialId(randomUUID());
    expect(found).toBeNull();
  });
});

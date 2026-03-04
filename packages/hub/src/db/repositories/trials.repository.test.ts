import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { PairingRepository } from "./pairing.repository.js";
import { TrialsRepository, TrialTransitionError } from "./trials.repository.js";
import type { Db } from "../index.js";

let db: Db;
let agentRepo: AgentRepository;
let pairingRepo: PairingRepository;
let repo: TrialsRepository;
let agentAId: string;
let agentBId: string;
let pairId: string;

beforeEach(async () => {
  db = createTestDb();
  agentRepo = new AgentRepository(db);
  pairingRepo = new PairingRepository(db);
  repo = new TrialsRepository(db);

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
  pairId = pairing.id;
});

describe("TrialsRepository", () => {
  describe("createTrial", () => {
    it("creates a trial in 'created' status", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: { id: "fw_hello", type: "forbidden_word", pattern: "hello" },
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      expect(trial.status).toBe("created");
      expect(trial.pairId).toBe(pairId);
      expect(trial.ruleId).toBe("fw_hello");
      expect(trial.createdBy).toBe(agentAId);
    });

    it("assigns a UUID id", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "cd".repeat(32),
        createdBy: agentAId,
      });
      expect(trial.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("getTrial", () => {
    it("returns trial by id", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      const found = await repo.getTrial(trial.id);
      expect(found?.id).toBe(trial.id);
    });

    it("returns null for unknown id", async () => {
      const found = await repo.getTrial(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe("getByPairId", () => {
    it("returns trials for a pair", async () => {
      await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      const results = await repo.getByPairId(pairId);
      expect(results).toHaveLength(1);
    });

    it("returns empty array for unknown pair", async () => {
      const results = await repo.getByPairId(randomUUID());
      expect(results).toHaveLength(0);
    });
  });

  describe("transitionStatus", () => {
    it("transitions created → started", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      const updated = await repo.transitionStatus(trial.id, "created", "started");
      expect(updated.status).toBe("started");
      expect(updated.startedAt).not.toBeNull();
    });

    it("transitions started → reported → settled", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      await repo.transitionStatus(trial.id, "created", "started");
      await repo.transitionStatus(trial.id, "started", "reported");
      const settled = await repo.transitionStatus(trial.id, "reported", "settled");
      expect(settled.status).toBe("settled");
      expect(settled.settledAt).not.toBeNull();
    });

    it("rejects illegal transition created → settled", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      await expect(repo.transitionStatus(trial.id, "created", "settled")).rejects.toThrow(
        TrialTransitionError,
      );
    });

    it("rejects wrong expected state", async () => {
      const trial = await repo.createTrial({
        pairId,
        ruleId: "fw_hello",
        rulePayload: {},
        seed: "ab".repeat(32),
        createdBy: agentAId,
      });
      await expect(repo.transitionStatus(trial.id, "started", "reported")).rejects.toThrow(
        TrialTransitionError,
      );
    });
  });
});

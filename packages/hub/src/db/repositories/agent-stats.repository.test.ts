import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { AgentStatsRepository } from "./agent-stats.repository.js";
import type { Db } from "../index.js";

let db: Db;
let repo: AgentStatsRepository;
let agentId: string;

beforeEach(async () => {
  db = createTestDb();
  const agentRepo = new AgentRepository(db);
  repo = new AgentStatsRepository(db);

  const agent = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "TestAgent",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: "test" + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  });
  agentId = agent.id;
});

describe("AgentStatsRepository", () => {
  describe("getStats", () => {
    it("returns null when no stats exist", async () => {
      const stats = await repo.getStats(agentId);
      expect(stats).toBeNull();
    });
  });

  describe("ensureStats", () => {
    it("creates stats with defaults", async () => {
      const stats = await repo.ensureStats(agentId);
      expect(stats.agentId).toBe(agentId);
      expect(stats.wins).toBe(0);
      expect(stats.losses).toBe(0);
      expect(stats.xp).toBe(0);
    });

    it("is idempotent", async () => {
      await repo.ensureStats(agentId);
      const stats = await repo.ensureStats(agentId);
      expect(stats.wins).toBe(0);
    });
  });

  describe("incrementWins", () => {
    it("increments wins by 1", async () => {
      const stats = await repo.incrementWins(agentId);
      expect(stats.wins).toBe(1);
    });

    it("increments cumulatively", async () => {
      await repo.incrementWins(agentId);
      const stats = await repo.incrementWins(agentId);
      expect(stats.wins).toBe(2);
    });
  });

  describe("incrementLosses", () => {
    it("increments losses by 1", async () => {
      const stats = await repo.incrementLosses(agentId);
      expect(stats.losses).toBe(1);
    });
  });

  describe("addXp", () => {
    it("adds xp amount", async () => {
      const stats = await repo.addXp(agentId, 100);
      expect(stats.xp).toBe(100);
    });

    it("accumulates xp", async () => {
      await repo.addXp(agentId, 100);
      const stats = await repo.addXp(agentId, 50);
      expect(stats.xp).toBe(150);
    });
  });
});

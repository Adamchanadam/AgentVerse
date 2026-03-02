/**
 * Unit tests for PairingRepository.
 * Verifies state machine transitions: pending→active, pending→revoked, active→revoked.
 * Verifies duplicate pairing rejection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { PairingRepository, PairingTransitionError } from "./pairing.repository.js";
import type { Db } from "../index.js";

let db: Db;
let agentRepo: AgentRepository;
let repo: PairingRepository;
let agentAId: string;
let agentBId: string;

beforeEach(async () => {
  db = createTestDb();
  agentRepo = new AgentRepository(db);
  repo = new PairingRepository(db);

  // Create two agents for pairing tests
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
});

describe("PairingRepository", () => {
  describe("create", () => {
    it("creates a new pairing in pending status", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      expect(pairing.agentAId).toBe(agentAId);
      expect(pairing.agentBId).toBe(agentBId);
      expect(pairing.status).toBe("pending");
    });

    it("assigns a UUID id", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      expect(pairing.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("findById", () => {
    it("returns pairing by id", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      const found = await repo.findById(pairing.id);
      expect(found?.id).toBe(pairing.id);
    });

    it("returns null for unknown id", async () => {
      const found = await repo.findById(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe("findActiveByAgents", () => {
    it("returns active pairing for an agent pair", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      await repo.transitionStatus(pairing.id, "pending", "active");
      const found = await repo.findActiveByAgents(agentAId, agentBId);
      expect(found?.status).toBe("active");
    });

    it("returns null when pairing is pending", async () => {
      await repo.create({ agentAId, agentBId });
      const found = await repo.findActiveByAgents(agentAId, agentBId);
      expect(found).toBeNull();
    });

    it("returns null when no pairing exists", async () => {
      const found = await repo.findActiveByAgents(agentAId, agentBId);
      expect(found).toBeNull();
    });
  });

  describe("transitionStatus (state machine)", () => {
    it("transitions pending → active", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      const updated = await repo.transitionStatus(pairing.id, "pending", "active");
      expect(updated.status).toBe("active");
    });

    it("transitions pending → revoked", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      const updated = await repo.transitionStatus(pairing.id, "pending", "revoked");
      expect(updated.status).toBe("revoked");
    });

    it("transitions active → revoked", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      await repo.transitionStatus(pairing.id, "pending", "active");
      const updated = await repo.transitionStatus(pairing.id, "active", "revoked");
      expect(updated.status).toBe("revoked");
    });

    it("rejects illegal transition active → pending", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      await repo.transitionStatus(pairing.id, "pending", "active");
      await expect(repo.transitionStatus(pairing.id, "active", "pending")).rejects.toThrow(
        PairingTransitionError,
      );
    });

    it("rejects illegal transition revoked → active", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      await repo.transitionStatus(pairing.id, "pending", "revoked");
      await expect(repo.transitionStatus(pairing.id, "revoked", "active")).rejects.toThrow(
        PairingTransitionError,
      );
    });

    it("throws if current state does not match expected", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      // Pass wrong expected state
      await expect(
        repo.transitionStatus(pairing.id, "active", "revoked"), // actual is 'pending'
      ).rejects.toThrow(PairingTransitionError);
    });
  });

  describe("hasPendingOrActive", () => {
    it("returns false when no pairing exists", async () => {
      const result = await repo.hasPendingOrActive(agentAId, agentBId);
      expect(result).toBe(false);
    });

    it("returns true when a pending pairing exists", async () => {
      await repo.create({ agentAId, agentBId });
      const result = await repo.hasPendingOrActive(agentAId, agentBId);
      expect(result).toBe(true);
    });

    it("returns false when only a revoked pairing exists", async () => {
      const pairing = await repo.create({ agentAId, agentBId });
      await repo.transitionStatus(pairing.id, "pending", "revoked");
      const result = await repo.hasPendingOrActive(agentAId, agentBId);
      expect(result).toBe(false);
    });
  });
});

/**
 * Unit tests for AgentRepository.
 * Uses pg-mem in-memory PostgreSQL — no Docker required.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { owners } from "../schema.js";
import type { VisibilityType } from "../schema.js";
import type { Db } from "../index.js";

let db: Db;
let repo: AgentRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new AgentRepository(db);
});

function makeAgentData(
  overrides: Partial<{
    id: string;
    displayName: string;
    pubkey: string;
    visibility: VisibilityType;
  }> = {},
) {
  return {
    id: overrides.id ?? randomUUID(),
    displayName: overrides.displayName ?? "TestAgent",
    personaTags: ["test"],
    capabilities: [{ name: "chat", version: "1.0" }],
    visibility: (overrides.visibility ?? "public") as VisibilityType,
    pubkey: overrides.pubkey ?? randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  };
}

describe("AgentRepository", () => {
  describe("upsert", () => {
    it("inserts a new agent and returns it", async () => {
      const data = makeAgentData();
      const agent = await repo.upsert(data);
      expect(agent.id).toBe(data.id);
      expect(agent.displayName).toBe("TestAgent");
      expect(agent.visibility).toBe("public");
    });

    it("updates an existing agent on conflict (pubkey)", async () => {
      const data = makeAgentData();
      await repo.upsert(data);
      const updated = await repo.upsert({ ...data, displayName: "UpdatedAgent" });
      expect(updated.displayName).toBe("UpdatedAgent");
    });

    it("stores personaTags as an array", async () => {
      const data = makeAgentData();
      const agent = await repo.upsert({ ...data, personaTags: ["tag1", "tag2"] });
      expect(agent.personaTags).toEqual(["tag1", "tag2"]);
    });

    it("preserves ownerId when provided", async () => {
      const ownerId = randomUUID();
      // Insert owner row directly to satisfy FK
      await db.insert(owners).values({ id: ownerId, handle: "owner1", pubkey: "owner-pubkey-1" });
      const data = { ...makeAgentData(), ownerId };
      const agent = await repo.upsert(data);
      expect(agent.ownerId).toBe(ownerId);
    });
  });

  describe("findById", () => {
    it("returns agent by id", async () => {
      const data = makeAgentData();
      await repo.upsert(data);
      const found = await repo.findById(data.id);
      expect(found?.id).toBe(data.id);
    });

    it("returns null for unknown id", async () => {
      const found = await repo.findById(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe("findByPubkey", () => {
    it("returns agent by pubkey", async () => {
      const data = makeAgentData();
      await repo.upsert(data);
      const found = await repo.findByPubkey(data.pubkey);
      expect(found?.pubkey).toBe(data.pubkey);
    });

    it("returns null for unknown pubkey", async () => {
      const found = await repo.findByPubkey("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("search", () => {
    it("returns public agents matching display_name query", async () => {
      await repo.upsert(
        makeAgentData({ displayName: "AlphaBot", pubkey: "aaa" + randomUUID().replace(/-/g, "") }),
      );
      await repo.upsert(
        makeAgentData({ displayName: "BetaBot", pubkey: "bbb" + randomUUID().replace(/-/g, "") }),
      );
      const results = await repo.search("Alpha");
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe("AlphaBot");
    });

    it("excludes non-public agents from search", async () => {
      await repo.upsert(
        makeAgentData({
          displayName: "HiddenBot",
          visibility: "private",
          pubkey: "ccc" + randomUUID().replace(/-/g, ""),
        }),
      );
      const results = await repo.search("Hidden");
      expect(results).toHaveLength(0);
    });

    it("returns all public agents when query is empty", async () => {
      await repo.upsert(makeAgentData({ pubkey: "ddd" + randomUUID().replace(/-/g, "") }));
      await repo.upsert(makeAgentData({ pubkey: "eee" + randomUUID().replace(/-/g, "") }));
      const results = await repo.search("");
      expect(results).toHaveLength(2);
    });
  });

  describe("findPaginated", () => {
    it("returns public agents with limit and offset", async () => {
      for (let i = 1; i <= 3; i++) {
        await repo.upsert({
          id: randomUUID(),
          displayName: `Agent ${i}`,
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey: `pubkey-paginate-${i}`,
          level: 1,
          badges: [],
        });
      }
      const page1 = await repo.findPaginated(undefined, 2, 0);
      expect(page1).toHaveLength(2);
      const page2 = await repo.findPaginated(undefined, 2, 2);
      expect(page2).toHaveLength(1);
    });

    it("filters by query string", async () => {
      await repo.upsert({
        id: randomUUID(),
        displayName: "Dragon Mage",
        personaTags: [],
        capabilities: [],
        visibility: "public",
        pubkey: "pubkey-dragon",
        level: 1,
        badges: [],
      });
      await repo.upsert({
        id: randomUUID(),
        displayName: "Healer Bot",
        personaTags: [],
        capabilities: [],
        visibility: "public",
        pubkey: "pubkey-healer",
        level: 1,
        badges: [],
      });
      const results = await repo.findPaginated("dragon", 10, 0);
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe("Dragon Mage");
    });
  });

  describe("countPublic", () => {
    it("returns total count of public agents", async () => {
      await repo.upsert(makeAgentData({ pubkey: "pk-cnt-1" }));
      await repo.upsert(makeAgentData({ pubkey: "pk-cnt-2" }));
      const total = await repo.countPublic();
      expect(total).toBe(2);
    });

    it("counts only matching agents when query provided", async () => {
      await repo.upsert(makeAgentData({ displayName: "CountBot", pubkey: "pk-cnt-3" }));
      await repo.upsert(makeAgentData({ displayName: "OtherBot", pubkey: "pk-cnt-4" }));
      const total = await repo.countPublic("Count");
      expect(total).toBe(1);
    });
  });
});

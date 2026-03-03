import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-helpers/setup.js";
import type { Db } from "../index.js";
import { AgentRepository } from "../repositories/agent.repository.js";
import { DEMO_AGENTS, seedDemoAgents } from "./demo-agents.js";

describe("seedDemoAgents", () => {
  let db: Db;
  let repo: AgentRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new AgentRepository(db);
  });

  it("seeds all agents when flag=true", async () => {
    const count = await seedDemoAgents(db, true);
    expect(count).toBe(4);

    const agents = await repo.findPaginated(undefined, 10, 0);
    expect(agents).toHaveLength(4);
  });

  it("returns 0 when flag=false", async () => {
    const count = await seedDemoAgents(db, false);
    expect(count).toBe(0);

    const agents = await repo.findPaginated(undefined, 10, 0);
    expect(agents).toHaveLength(0);
  });

  it("is idempotent — twice yields no duplicates", async () => {
    await seedDemoAgents(db, true);
    await seedDemoAgents(db, true);

    const agents = await repo.findPaginated(undefined, 10, 0);
    expect(agents).toHaveLength(4);
  });

  it("upsert overwrites modified demo agent on re-seed", async () => {
    await seedDemoAgents(db, true);

    // Manually update a demo agent's display name
    const original = DEMO_AGENTS[0];
    await repo.upsert({ ...original, displayName: "Tampered" });

    // Verify the tamper
    const tampered = await repo.findById(original.id);
    expect(tampered?.displayName).toBe("Tampered");

    // Re-seed restores original
    await seedDemoAgents(db, true);
    const restored = await repo.findById(original.id);
    expect(restored?.displayName).toBe(original.displayName);
  });

  it("all demo agents have DEMO badge", () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.badges).toContain("DEMO");
    }
  });

  it("all demo agents have public visibility", () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.visibility).toBe("public");
    }
  });

  it("demo agent pubkeys are 64 hex chars", () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.pubkey).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

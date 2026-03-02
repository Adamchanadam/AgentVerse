import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { TEST_CONFIG } from "../test-config.js";

async function seedAgent(
  repo: AgentRepository,
  overrides?: Partial<{ displayName: string; pubkey: string }>,
) {
  return repo.upsert({
    id: randomUUID(),
    displayName: overrides?.displayName ?? "Test Agent",
    personaTags: ["test"],
    capabilities: [],
    visibility: "public",
    pubkey: overrides?.pubkey ?? `pk-${randomUUID()}`,
    level: 1,
    badges: [],
  });
}

describe("GET /api/agents", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with agents array", async () => {
    const repo = new AgentRepository(db);
    await seedAgent(repo, { displayName: "Alpha", pubkey: "pk-alpha" });
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ agents: unknown[]; total: number }>();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents).toHaveLength(1);
    expect(typeof body.total).toBe("number");
  });

  it("filters by q param", async () => {
    const repo = new AgentRepository(db);
    await seedAgent(repo, { displayName: "Warrior", pubkey: "pk-warrior" });
    await seedAgent(repo, { displayName: "Mage", pubkey: "pk-mage" });
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/agents?q=Warrior",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ agents: Array<{ displayName: string }> }>();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].displayName).toBe("Warrior");
  });
});

describe("GET /api/agents/:id", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 404 for unknown id", async () => {
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/nonexistent-id",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 with agent data for known id", async () => {
    const repo = new AgentRepository(db);
    const agent = await seedAgent(repo, { displayName: "Rogue", pubkey: "pk-rogue" });
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agent.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; displayName: string }>();
    expect(body.id).toBe(agent.id);
    expect(body.displayName).toBe("Rogue");
  });
});

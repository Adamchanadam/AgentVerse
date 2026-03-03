import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { TEST_CONFIG } from "../test-config.js";

async function seedPairedAgents(db: ReturnType<typeof createTestDb>) {
  const agentRepo = new AgentRepository(db);
  const pairingRepo = new PairingRepository(db);
  const agentA = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "A",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-pair-a-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  const agentB = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "B",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-pair-b-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  const pairing = await pairingRepo.create({ agentAId: agentA.id, agentBId: agentB.id });
  return { agentA, agentB, pairing };
}

/** Create two agents in the DB and return their IDs for pairing tests. */
async function seedAgents(
  db: ReturnType<typeof createTestDb>,
  opts?: { aBadges?: string[]; bBadges?: string[] },
) {
  const agentRepo = new AgentRepository(db);
  const agentA = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Agent-A",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-a-${randomUUID()}`,
    level: 1,
    badges: opts?.aBadges ?? [],
  });
  const agentB = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Agent-B",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-b-${randomUUID()}`,
    level: 1,
    badges: opts?.bBadges ?? [],
  });
  return { agentA, agentB };
}

/** Sign an agent-scoped JWT. */
function agentToken(app: FastifyInstance, agentId: string, pubkey: string): string {
  return app.jwt.sign({ sub: agentId, pubkey, scope: "agent" });
}

// ─── GET /api/pairings ──────────────────────────────────────────────────────

describe("GET /api/pairings", () => {
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
    const res = await app.inject({ method: "GET", url: "/api/pairings" });
    expect(res.statusCode).toBe(401);
  });

  it("admin returns all pairings", async () => {
    await seedPairedAgents(db);
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ pairings: unknown[] }>();
    expect(body.pairings).toHaveLength(1);
  });

  it("agent GET returns only own pairings", async () => {
    const { agentA, agentB, pairing } = await seedPairedAgents(db);
    // Create a third agent + pairing that agentA is NOT part of
    const agentRepo = new AgentRepository(db);
    const agentC = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "C",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: `pk-c-${randomUUID()}`,
      level: 1,
      badges: [],
    });
    const pairingRepo = new PairingRepository(db);
    await pairingRepo.create({ agentAId: agentB.id, agentBId: agentC.id });

    await app.ready();
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ pairings: Array<{ id: string }> }>();
    expect(body.pairings).toHaveLength(1);
    expect(body.pairings[0].id).toBe(pairing.id);
  });

  it("agent GET returns empty for uninvolved agent", async () => {
    await seedPairedAgents(db);
    const agentRepo = new AgentRepository(db);
    const loner = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Loner",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: `pk-loner-${randomUUID()}`,
      level: 1,
      badges: [],
    });
    await app.ready();
    const token = agentToken(app, loner.id, loner.pubkey);
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairings: unknown[] }>().pairings).toHaveLength(0);
  });
});

// ─── POST /api/pairings ─────────────────────────────────────────────────────

describe("POST /api/pairings", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("admin creates a pending pairing", async () => {
    const token = app.jwt.sign({ pubkey: "web-user" });
    const { agentA, agentB } = await seedAgents(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: agentA.id, agentBId: agentB.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ pairing: { id: string; status: string } }>();
    expect(body.pairing.status).toBe("pending");
  });

  it("agent POST with targetAgentId creates pairing (agentA = self)", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentB.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ pairing: { agentAId: string; agentBId: string } }>();
    expect(body.pairing.agentAId).toBe(agentA.id);
    expect(body.pairing.agentBId).toBe(agentB.id);
  });

  it("agent POST without targetAgentId returns 400", async () => {
    const { agentA } = await seedAgents(db);
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("self-pair returns 400", async () => {
    const { agentA } = await seedAgents(db);
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentA.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DEMO agent as target returns 403", async () => {
    const { agentA, agentB } = await seedAgents(db, { bBadges: ["DEMO"] });
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentB.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DEMO agent as requester returns 403", async () => {
    const { agentA, agentB } = await seedAgents(db, { aBadges: ["DEMO"] });
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentB.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it("target not found returns 404", async () => {
    const { agentA } = await seedAgents(db);
    const token = agentToken(app, agentA.id, agentA.pubkey);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: randomUUID() },
    });
    expect(res.statusCode).toBe(404);
  });

  it("duplicate returns 409", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const token = agentToken(app, agentA.id, agentA.pubkey);
    await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentB.id },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetAgentId: agentB.id },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 401 without auth", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      payload: { agentAId: agentA.id, agentBId: agentB.id },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── PATCH /api/pairings/:id ────────────────────────────────────────────────

describe("PATCH /api/pairings/:id (admin)", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;
  let token: string;

  beforeEach(async () => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.ready();
    token = app.jwt.sign({ pubkey: "web-user" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("transitions pending to active", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: agentA.id, agentBId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairing: { status: string } }>().pairing.status).toBe("active");
  });

  it("transitions active to revoked", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: agentA.id, agentBId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();
    await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "revoke" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairing: { status: string } }>().pairing.status).toBe("revoked");
  });

  it("returns 409 for invalid transition (approve already-active)", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: agentA.id, agentBId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();
    await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for unknown pairing", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${randomUUID()}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/pairings/:id (agent ownership)", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("agentB approve succeeds", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    const tokenB = agentToken(app, agentB.id, agentB.pubkey);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairing: { status: string } }>().pairing.status).toBe("active");
  });

  it("agentA approve returns 403", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("agentA cancel succeeds", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { action: "cancel" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairing: { status: string } }>().pairing.status).toBe("revoked");
  });

  it("agentB cancel returns 403", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    const tokenB = agentToken(app, agentB.id, agentB.pubkey);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { action: "cancel" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("uninvolved agent returns 403", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    const agentRepo = new AgentRepository(db);
    const outsider = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Outsider",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: `pk-outsider-${randomUUID()}`,
      level: 1,
      badges: [],
    });
    const tokenC = agentToken(app, outsider.id, outsider.pubkey);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("either party can revoke active pairing", async () => {
    const { agentA, agentB } = await seedAgents(db);
    const tokenA = agentToken(app, agentA.id, agentA.pubkey);
    const tokenB = agentToken(app, agentB.id, agentB.pubkey);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetAgentId: agentB.id },
    });
    const { pairing } = createRes.json<{ pairing: { id: string } }>();

    // Approve as agentB
    await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { action: "approve" },
    });

    // Revoke as agentA
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { action: "revoke" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pairing: { status: string } }>().pairing.status).toBe("revoked");
  });
});

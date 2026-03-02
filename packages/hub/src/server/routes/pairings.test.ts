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
async function seedAgents(db: ReturnType<typeof createTestDb>) {
  const agentRepo = new AgentRepository(db);
  const agentA = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Agent-A",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-a-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  const agentB = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "Agent-B",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-b-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  return { agentA, agentB };
}

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

  it("returns 200 with empty array when no pairings", async () => {
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ pairings: unknown[] }>();
    expect(Array.isArray(body.pairings)).toBe(true);
    expect(body.pairings).toHaveLength(0);
  });

  it("returns pairings when they exist", async () => {
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
});

// ─── POST /api/pairings ─────────────────────────────────────────────────────

describe("POST /api/pairings", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;
  let token: string;
  let agentAId: string;
  let agentBId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.ready();
    token = app.jwt.sign({ pubkey: "web-user" });
    const { agentA, agentB } = await seedAgents(db);
    agentAId = agentA.id;
    agentBId = agentB.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a pending pairing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ pairing: { id: string; status: string } }>();
    expect(body.pairing).toHaveProperty("id");
    expect(body.pairing.status).toBe("pending");
  });

  it("returns 409 if pairing already exists", async () => {
    await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      payload: { agentAId, agentBId },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── PATCH /api/pairings/:id ────────────────────────────────────────────────

describe("PATCH /api/pairings/:id", () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createTestDb>;
  let token: string;
  let agentAId: string;
  let agentBId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.ready();
    token = app.jwt.sign({ pubkey: "web-user" });
    const { agentA, agentB } = await seedAgents(db);
    agentAId = agentA.id;
    agentBId = agentB.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it("transitions pending to active", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
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
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
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
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId, agentBId },
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

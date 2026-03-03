import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";
import { AUTH } from "../auth-constants.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

function testKeypair() {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  return { privHex: bytesToHex(priv), pubHex: bytesToHex(pub) };
}

function signTestNonce(nonce: string, privHex: string): string {
  const msg = utf8ToBytes(AUTH.NONCE_PREFIX + nonce);
  return bytesToHex(ed25519.sign(msg, hexToBytes(privHex)));
}

interface BootstrapResponse {
  jwt: string;
  agent_id: string;
  agent_card: {
    id: string;
    displayName: string;
    personaTags: string[];
    level: number;
    badges: string[];
  };
  is_new: boolean;
}

// ─── POST /api/auth/token (admin flow) ───────────────────────────────────────

describe("POST /api/auth/token", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns JWT when secret matches", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: TEST_CONFIG.HUB_ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ token: string }>();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  it("returns 401 when secret is wrong", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "wrong-secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when secret is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returned token works for authenticated endpoints", async () => {
    const tokenRes = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: TEST_CONFIG.HUB_ADMIN_SECRET },
    });
    const { token } = tokenRes.json<{ token: string }>();

    const agentsRes = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(agentsRes.statusCode).toBe(200);
  });
});

// ─── GET /api/auth/nonce ─────────────────────────────────────────────────────

describe("GET /api/auth/nonce", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a 64-char hex nonce", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ nonce: string }>();
    expect(body.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different nonce each time", async () => {
    const r1 = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    const r2 = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    expect(r1.json<{ nonce: string }>().nonce).not.toBe(r2.json<{ nonce: string }>().nonce);
  });
});

// ─── POST /api/auth/bootstrap ────────────────────────────────────────────────

describe("POST /api/auth/bootstrap", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  async function getNonce(): Promise<string> {
    const res = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    return res.json<{ nonce: string }>().nonce;
  }

  it("creates a new agent on first bootstrap", async () => {
    const kp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce, display_name: "TestBot" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<BootstrapResponse>();
    expect(body.is_new).toBe(true);
    expect(body.jwt).toBeTruthy();
    expect(body.agent_id).toBeTruthy();
    expect(body.agent_card.displayName).toBe("TestBot");
  });

  it("returns is_new=false for returning agent (same pubkey)", async () => {
    const kp = testKeypair();

    // First bootstrap
    const n1 = await getNonce();
    await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        pubkey: kp.pubHex,
        signature: signTestNonce(n1, kp.privHex),
        nonce: n1,
        display_name: "Bot",
      },
    });

    // Second bootstrap
    const n2 = await getNonce();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: signTestNonce(n2, kp.privHex), nonce: n2 },
    });
    const body = res.json<BootstrapResponse>();
    expect(body.is_new).toBe(false);
    expect(body.agent_card.displayName).toBe("Bot"); // preserved from first registration
  });

  it("returns 401 for unknown nonce", async () => {
    const kp = testKeypair();
    const fakeNonce = "a".repeat(64);
    const sig = signTestNonce(fakeNonce, kp.privHex);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce: fakeNonce },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe("Invalid or expired nonce");
  });

  it("returns 401 for reused nonce", async () => {
    const kp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);

    // First use — success
    await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce },
    });

    // Second use — replay
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when nonce is consumed (simulates expiry)", async () => {
    const kp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);

    // Manually consume the nonce to simulate TTL expiry
    app.nonceStore.consume(nonce);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe("Invalid or expired nonce");
  });

  it("returns 401 for invalid signature (wrong key)", async () => {
    const kp = testKeypair();
    const wrongKp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, wrongKp.privHex); // signed with wrong key

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe("Invalid signature");
  });

  it("returns 400 for malformed pubkey", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: "not-hex", signature: "a".repeat(128), nonce: "b".repeat(64) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("uses default display_name when not provided", async () => {
    const kp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce },
    });
    const body = res.json<BootstrapResponse>();
    expect(body.agent_card.displayName).toBe(`Agent-${kp.pubHex.slice(0, 8)}`);
  });

  it("agent JWT works for authenticated endpoints", async () => {
    const kp = testKeypair();
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);

    const bRes = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce, display_name: "MyBot" },
    });
    const { jwt: agentJwt } = bRes.json<BootstrapResponse>();

    const agentsRes = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${agentJwt}` },
    });
    expect(agentsRes.statusCode).toBe(200);
  });
});

// ─── Integration tests: PoP bootstrap end-to-end ─────────────────────────────

describe("bootstrap integration", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  async function getNonce(): Promise<string> {
    const res = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    return res.json<{ nonce: string }>().nonce;
  }

  async function bootstrap(kp: ReturnType<typeof testKeypair>, name?: string) {
    const nonce = await getNonce();
    const sig = signTestNonce(nonce, kp.privHex);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: { pubkey: kp.pubHex, signature: sig, nonce, display_name: name },
    });
    return res.json<BootstrapResponse>();
  }

  it("full flow: bootstrap → agent JWT → GET /api/agents returns the new agent", async () => {
    const kp = testKeypair();
    const { jwt: agentJwt, agent_id } = await bootstrap(kp, "IntegrationBot");

    const agentsRes = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${agentJwt}` },
    });
    expect(agentsRes.statusCode).toBe(200);
    const { agents } = agentsRes.json<{ agents: Array<{ id: string; displayName: string }> }>();
    const found = agents.find((a) => a.id === agent_id);
    expect(found).toBeTruthy();
    expect(found!.displayName).toBe("IntegrationBot");
  });

  it("admin + agent JWTs coexist: both can access /api/agents", async () => {
    const adminRes = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: TEST_CONFIG.HUB_ADMIN_SECRET },
    });
    const adminJwt = adminRes.json<{ token: string }>().token;

    const kp = testKeypair();
    const { jwt: agentJwt } = await bootstrap(kp, "CoexistBot");

    const r1 = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${adminJwt}` },
    });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${agentJwt}` },
    });
    expect(r2.statusCode).toBe(200);
  });

  it("returning: same keypair → same agent_id, is_new=false", async () => {
    const kp = testKeypair();
    const first = await bootstrap(kp, "ReturningBot");
    expect(first.is_new).toBe(true);

    const second = await bootstrap(kp);
    expect(second.is_new).toBe(false);
    expect(second.agent_id).toBe(first.agent_id);
  });
});

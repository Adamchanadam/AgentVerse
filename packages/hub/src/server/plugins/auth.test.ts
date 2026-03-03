import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { authPlugin, type RequestIdentity } from "./auth.js";
import { TEST_CONFIG } from "../test-config.js";

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate("config", TEST_CONFIG);
  void app.register(jwt, { secret: TEST_CONFIG.JWT_SECRET });
  void app.register(authPlugin);
  // A protected test route — registered in app.after() so app.authenticate is defined by authPlugin
  app.after(() => {
    app.get("/protected", { preHandler: app.authenticate }, async () => ({ ok: true }));
    app.get("/test-identity", { preHandler: [app.authenticate] }, async (request) => {
      return { identity: request.identity };
    });
  });
  return app;
}

describe("authPlugin", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with a valid Bearer JWT", async () => {
    await app.ready();
    const token = app.jwt.sign({ pubkey: "abc123" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 with a token signed by a different secret", async () => {
    const wrongApp = Fastify({ logger: false });
    void wrongApp.register(jwt, { secret: "wrong-secret-do-not-use" });
    await wrongApp.ready();
    const badToken = wrongApp.jwt.sign({ pubkey: "eve" });
    await wrongApp.close();
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${badToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with a malformed token string", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer thisisnot.avalid.jwt" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("auth plugin identity decoration", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("admin JWT → identity.role === 'admin'", async () => {
    await app.ready();
    const token = app.jwt.sign({ sub: "admin", role: "admin" }, { expiresIn: "1h" });
    const res = await app.inject({
      method: "GET",
      url: "/test-identity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ identity: RequestIdentity }>();
    expect(body.identity).toEqual({ role: "admin" });
  });

  it("agent JWT → identity.role === 'agent' with agentId and pubkey", async () => {
    await app.ready();
    const token = app.jwt.sign(
      { sub: "550e8400-e29b-41d4-a716-446655440000", pubkey: "ab".repeat(32), scope: "agent" },
      { expiresIn: "1h" },
    );
    const res = await app.inject({
      method: "GET",
      url: "/test-identity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ identity: RequestIdentity }>();
    expect(body.identity).toEqual({
      role: "agent",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      pubkey: "ab".repeat(32),
    });
  });

  it("legacy JWT { pubkey: 'web-user' } → identity.role === 'admin' (backward compat)", async () => {
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" }, { expiresIn: "1h" });
    const res = await app.inject({
      method: "GET",
      url: "/test-identity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ identity: RequestIdentity }>();
    expect(body.identity).toEqual({ role: "admin" });
  });

  it("no token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/test-identity" });
    expect(res.statusCode).toBe(401);
  });

  it("invalid token → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test-identity",
      headers: { authorization: "Bearer bad.token.here" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("expired token → 401", async () => {
    await app.ready();
    // Sign with exp already in the past
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const token = app.jwt.sign({ sub: "admin", role: "admin", exp: pastExp });
    const res = await app.inject({
      method: "GET",
      url: "/test-identity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

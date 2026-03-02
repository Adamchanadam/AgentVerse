import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

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

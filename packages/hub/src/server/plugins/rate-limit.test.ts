import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import type { HubConfig } from "../../env.js";
import { TEST_CONFIG } from "../test-config.js";

/** Config with very low limit to test rate limiting without many requests */
const TIGHT_CONFIG: HubConfig = { ...TEST_CONFIG, RATE_LIMIT_MAX: 2 };

describe("rate limiting", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    // Each test gets a fresh app with a fresh rate-limit store
    app = buildApp(TIGHT_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows requests up to the limit", async () => {
    const r1 = await app.inject({ method: "GET", url: "/api/health" });
    const r2 = await app.inject({ method: "GET", url: "/api/health" });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });

  it("returns 429 after exceeding the limit", async () => {
    await app.inject({ method: "GET", url: "/api/health" });
    await app.inject({ method: "GET", url: "/api/health" });
    const r3 = await app.inject({ method: "GET", url: "/api/health" });
    expect(r3.statusCode).toBe(429);
  });

  it("sets rate limit headers on response", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });

  it("429 response body has correct shape", async () => {
    await app.inject({ method: "GET", url: "/api/health" });
    await app.inject({ method: "GET", url: "/api/health" });
    const r3 = await app.inject({ method: "GET", url: "/api/health" });
    const body = r3.json<{ error: string; retry_after: number }>();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(typeof body.retry_after).toBe("number");
  });
});

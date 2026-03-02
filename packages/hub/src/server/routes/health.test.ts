import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

describe("GET /api/health", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.connectedClients).toBe("number");
    expect(typeof body.eventsPerMinute).toBe("number");
    expect(typeof body.errorRate).toBe("number");
  });

  it("responds to CORS preflight", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/health",
      headers: {
        origin: "http://localhost:3001",
        "access-control-request-method": "GET",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

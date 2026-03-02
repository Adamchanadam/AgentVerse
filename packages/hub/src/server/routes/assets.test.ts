import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

describe("GET /api/assets/:pack/*", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 for existing manifest.json", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/mvp-default/manifest.json",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string }>();
    expect(typeof body.id).toBe("string");
    expect(body.id).toBe("mvp-default");
  });

  it("returns 404 for non-existent pack", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/nonexistent-pack/file.json",
    });
    expect(res.statusCode).toBe(404);
  });

  it("does not require auth", async () => {
    // No Authorization header — assets are public
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/mvp-default/manifest.json",
    });
    expect(res.statusCode).toBe(200);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { authPlugin } from "./auth.js";
import { TEST_CONFIG } from "../test-config.js";

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate("config", TEST_CONFIG);
  void app.register(jwt, { secret: TEST_CONFIG.JWT_SECRET });
  void app.register(authPlugin);
  // A protected test route — registered in app.after() so app.authenticate is defined by authPlugin
  app.after(() => {
    app.get("/protected", { preHandler: app.authenticate }, async () => ({ ok: true }));
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

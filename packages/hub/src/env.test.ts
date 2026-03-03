import { describe, it, expect } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  const base = { DATABASE_URL: "postgres://localhost/test", JWT_SECRET: "s3cr3t" };

  it("returns defaults for optional fields", () => {
    const cfg = parseEnv(base);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.CORS_ORIGIN).toBe("*");
    expect(cfg.RATE_LIMIT_MAX).toBe(100);
    expect(cfg.MSG_RELAY_TTL_DAYS).toBe(0);
    expect(cfg.HUB_ADMIN_SECRET).toBe("changeme");
    expect(cfg.SEED_DEMO).toBe(false);
  });

  it("throws if DATABASE_URL is missing", () => {
    expect(() => parseEnv({ JWT_SECRET: "s3cr3t" })).toThrow("DATABASE_URL");
  });

  it("throws if JWT_SECRET is missing", () => {
    expect(() => parseEnv({ DATABASE_URL: "postgres://x" })).toThrow("JWT_SECRET");
  });

  it("parses custom PORT and RATE_LIMIT_MAX", () => {
    const cfg = parseEnv({ ...base, PORT: "4000", RATE_LIMIT_MAX: "50" });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.RATE_LIMIT_MAX).toBe(50);
  });
});

describe("parseEnv — numeric validation", () => {
  const base = { DATABASE_URL: "postgres://localhost/test", JWT_SECRET: "s3cr3t" };

  it("throws on non-numeric PORT", () => {
    expect(() => parseEnv({ ...base, PORT: "auto" })).toThrow("PORT");
  });

  it("throws on out-of-range PORT", () => {
    expect(() => parseEnv({ ...base, PORT: "99999" })).toThrow("PORT");
    expect(() => parseEnv({ ...base, PORT: "0" })).toThrow("PORT");
  });

  it("throws on non-numeric RATE_LIMIT_MAX", () => {
    expect(() => parseEnv({ ...base, RATE_LIMIT_MAX: "unlimited" })).toThrow("RATE_LIMIT_MAX");
  });
});

describe("parseEnv — SEED_DEMO", () => {
  const base = { DATABASE_URL: "postgres://localhost/test", JWT_SECRET: "s3cr3t" };

  it("defaults to false when not set", () => {
    expect(parseEnv(base).SEED_DEMO).toBe(false);
    expect(parseEnv({ ...base, SEED_DEMO: "" }).SEED_DEMO).toBe(false);
  });

  it("parses case-insensitive true", () => {
    expect(parseEnv({ ...base, SEED_DEMO: "true" }).SEED_DEMO).toBe(true);
    expect(parseEnv({ ...base, SEED_DEMO: "TRUE" }).SEED_DEMO).toBe(true);
    expect(parseEnv({ ...base, SEED_DEMO: "True" }).SEED_DEMO).toBe(true);
    expect(parseEnv({ ...base, SEED_DEMO: "false" }).SEED_DEMO).toBe(false);
  });
});

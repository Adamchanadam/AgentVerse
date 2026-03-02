import type { HubConfig } from "../env.js";

/** Minimal config for use in tests. Uses a distinct low rate limit for rate-limit tests. */
export const TEST_CONFIG: HubConfig = {
  PORT: 3000,
  DATABASE_URL: "postgres://localhost/test",
  JWT_SECRET: "test-secret-32-chars-minimum-pad",
  CORS_ORIGIN: "*",
  RATE_LIMIT_MAX: 1000, // high so normal tests don't hit limits
  MSG_RELAY_TTL_DAYS: 0,
  HUB_ADMIN_SECRET: "test-admin-secret",
};

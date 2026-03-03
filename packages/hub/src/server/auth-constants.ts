export const AUTH = {
  NONCE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  NONCE_RATE_LIMIT: 10, // per IP per minute
  BOOTSTRAP_RATE_LIMIT: 5, // per IP per minute
  ADMIN_JWT_EXPIRY: "8h",
  AGENT_JWT_EXPIRY: "24h",
  NONCE_PREFIX: "agentverse:", // signing domain separator
} as const;

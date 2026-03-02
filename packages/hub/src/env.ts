export interface HubConfig {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** Max requests per IP per minute for general REST endpoints. Default: 100 */
  RATE_LIMIT_MAX: number;
  /** Days to retain offline messages (TTL mode). 0 = disabled (zero-drop mode). */
  MSG_RELAY_TTL_DAYS: number;
  /** Shared secret for Web UI admin login (POST /api/auth/token). */
  HUB_ADMIN_SECRET: string;
}

function requireInt(
  value: string | undefined,
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const raw = value ?? String(fallback);
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`${name} must be a valid integer, got: "${raw}"`);
  if (min !== undefined && n < min) throw new Error(`${name} must be >= ${min}, got: ${n}`);
  if (max !== undefined && n > max) throw new Error(`${name} must be <= ${max}, got: ${n}`);
  return n;
}

function parseAdminSecret(value: string | undefined): string {
  const secret = value ?? "changeme";
  if (secret === "changeme") {
    console.warn(
      "[SECURITY] HUB_ADMIN_SECRET is set to the default value. Change it before deploying to production.",
    );
  }
  return secret;
}

export function parseEnv(env: Record<string, string | undefined> = process.env): HubConfig {
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

  const JWT_SECRET = env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

  return {
    PORT: requireInt(env.PORT, "PORT", 3000, 1, 65535),
    DATABASE_URL,
    JWT_SECRET,
    CORS_ORIGIN: env.CORS_ORIGIN ?? "*",
    RATE_LIMIT_MAX: requireInt(env.RATE_LIMIT_MAX, "RATE_LIMIT_MAX", 100, 1),
    MSG_RELAY_TTL_DAYS: requireInt(env.MSG_RELAY_TTL_DAYS, "MSG_RELAY_TTL_DAYS", 0, 0),
    HUB_ADMIN_SECRET: parseAdminSecret(env.HUB_ADMIN_SECRET),
  };
}

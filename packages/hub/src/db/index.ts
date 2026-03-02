import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Create a drizzle DB instance from an existing pg Pool.
 * Used in tests (pass a pg-mem pool) and in the real server startup.
 */
export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * Create a pg Pool + drizzle DB from a connection string.
 * This is the production entry point.
 *
 * Usage:
 *   const { db, pool } = createDbFromUrl(process.env.DATABASE_URL);
 *   // on shutdown: await pool.end();
 */
export function createDbFromUrl(connectionString: string): { db: Db; pool: pg.Pool } {
  if (!connectionString) {
    throw new Error("createDbFromUrl: connectionString must not be empty");
  }
  const pool = new pg.Pool({ connectionString });
  return { db: createDb(pool), pool };
}

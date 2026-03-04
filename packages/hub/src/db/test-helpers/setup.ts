import { newDb } from "pg-mem";
import * as pg from "pg";
import { createDb, type Db } from "../index.js";

/**
 * DDL for all tables used in tests.
 * Uses TEXT for UUIDs (pg-mem compat), skips DEFERRABLE constraints and DB triggers.
 * Column semantics match schema.ts exactly.
 */
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS owners (
    id          TEXT PRIMARY KEY,
    handle      TEXT UNIQUE NOT NULL,
    pubkey      TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agents (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT REFERENCES owners(id),
    display_name TEXT NOT NULL,
    persona_tags TEXT[] NOT NULL DEFAULT '{}',
    capabilities JSONB NOT NULL DEFAULT '[]',
    visibility   TEXT NOT NULL DEFAULT 'public',
    pubkey       TEXT UNIQUE NOT NULL,
    level        INTEGER NOT NULL DEFAULT 1,
    badges       TEXT[] NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS pairings (
    id          TEXT PRIMARY KEY,
    agent_a_id  TEXT NOT NULL REFERENCES agents(id),
    agent_b_id  TEXT NOT NULL REFERENCES agents(id),
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE SEQUENCE IF NOT EXISTS events_server_seq_seq START 1;
  CREATE TABLE IF NOT EXISTS events (
    server_seq    BIGINT PRIMARY KEY DEFAULT nextval('events_server_seq_seq'),
    event_id      TEXT UNIQUE NOT NULL,
    event_type    TEXT NOT NULL,
    ts            TIMESTAMPTZ NOT NULL,
    sender_pubkey TEXT NOT NULL,
    recipient_ids TEXT[] NOT NULL DEFAULT '{}',
    nonce         TEXT NOT NULL,
    sig           TEXT NOT NULL,
    payload       JSONB NOT NULL DEFAULT '{}',
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS gene_packs (
    id               TEXT PRIMARY KEY,
    owner_agent_id   TEXT NOT NULL REFERENCES agents(id),
    skill_slug       TEXT NOT NULL,
    version          TEXT NOT NULL,
    summary          TEXT NOT NULL DEFAULT '',
    permissions_required JSONB NOT NULL DEFAULT '{}',
    state            TEXT NOT NULL DEFAULT 'unverified',
    artifact_hash    TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS lineage_events (
    id                BIGSERIAL PRIMARY KEY,
    parent_genepack_a TEXT NOT NULL REFERENCES gene_packs(id),
    parent_genepack_b TEXT NOT NULL REFERENCES gene_packs(id),
    child_genepack    TEXT NOT NULL REFERENCES gene_packs(id),
    approver_a_sig    TEXT NOT NULL,
    approver_b_sig    TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS trials (
    id          TEXT PRIMARY KEY,
    pair_id     TEXT NOT NULL REFERENCES pairings(id),
    rule_id     TEXT NOT NULL,
    rule_payload JSONB NOT NULL DEFAULT '{}',
    seed        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'created',
    created_by  TEXT NOT NULL REFERENCES agents(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at  TIMESTAMPTZ,
    settled_at  TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS trial_results (
    id                TEXT PRIMARY KEY,
    trial_id          TEXT NOT NULL UNIQUE REFERENCES trials(id),
    winner_agent_id   TEXT NOT NULL REFERENCES agents(id),
    loser_agent_id    TEXT NOT NULL REFERENCES agents(id),
    rule_id           TEXT NOT NULL,
    trigger_event_id  TEXT NOT NULL,
    transcript_digest TEXT NOT NULL,
    sig_winner        TEXT NOT NULL,
    sig_loser         TEXT NOT NULL,
    xp_winner         INTEGER NOT NULL DEFAULT 100,
    xp_loser          INTEGER NOT NULL DEFAULT 25,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agent_stats (
    agent_id   TEXT PRIMARY KEY REFERENCES agents(id),
    wins       INTEGER NOT NULL DEFAULT 0,
    losses     INTEGER NOT NULL DEFAULT 0,
    xp         INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS offline_messages (
    id             TEXT PRIMARY KEY,
    server_seq     BIGINT NOT NULL REFERENCES events(server_seq),
    pair_id        TEXT NOT NULL REFERENCES pairings(id),
    sender_pubkey  TEXT NOT NULL,
    ciphertext     TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL
  );
`;

interface PgQueryConfig {
  text?: string;
  values?: unknown[];
  rowMode?: string;
  types?: unknown;
  name?: string;
  [key: string]: unknown;
}

interface PgFieldDesc {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: string;
}

interface PgResult {
  rows: Record<string, unknown>[] | unknown[][];
  fields?: PgFieldDesc[];
  rowCount?: number;
  command?: string;
}

/**
 * Wraps a pg-mem Pool to make it compatible with drizzle-orm's node-postgres adapter.
 *
 * drizzle-orm injects two query config properties that pg-mem does not support:
 *
 * 1. `types.getTypeParser` — pg-mem throws "getTypeParser is not supported" when a
 *    parameterized query has a custom `types` object. We strip it. drizzle only uses
 *    it to return raw timestamp strings; pg-mem already returns timestamps as strings.
 *
 * 2. `rowMode: "array"` — pg-mem throws "pg rowMode" when this is present. drizzle
 *    uses array-mode rows so `mapResultRow` can index columns by position. We strip
 *    `rowMode`, let pg-mem return object rows, then convert them to arrays using the
 *    key order of the first result row. This key order matches the SELECT column order
 *    because pg-mem preserves insertion/column order in result objects.
 *
 * We return a NEW result object (spread + overrides) because `result.fields` is a
 * read-only getter on pg-mem's result and cannot be mutated in-place.
 */
function wrapPoolForPgMem(rawPool: {
  query: (query: PgQueryConfig | string, values?: unknown[]) => Promise<PgResult>;
}): pg.Pool {
  return new Proxy(rawPool, {
    get(target, prop) {
      if (prop === "query") {
        return async (queryOrText: PgQueryConfig | string, values?: unknown[]) => {
          let wasArrayMode = false;
          let cleaned: PgQueryConfig | string;

          if (queryOrText !== null && typeof queryOrText === "object") {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { types: _types, rowMode, ...rest } = queryOrText as PgQueryConfig;
            wasArrayMode = rowMode === "array";
            cleaned = rest;
          } else {
            cleaned = queryOrText;
          }

          const result = await target.query(cleaned, values);

          if (wasArrayMode && result.rows.length > 0) {
            // Convert object rows to positional arrays so drizzle's mapResultRow
            // can index columns correctly. Object.keys order matches SELECT column
            // order because pg-mem preserves column insertion order in result objects.
            const objRows = result.rows as Record<string, unknown>[];
            const keys = Object.keys(objRows[0]);
            const arrayRows: unknown[][] = objRows.map((row) => keys.map((k) => row[k]));
            const fields: PgFieldDesc[] = keys.map((name) => ({
              name,
              tableID: 0,
              columnID: 0,
              dataTypeID: 0,
              dataTypeSize: -1,
              dataTypeModifier: -1,
              format: "text",
            }));
            // Return a new object — result.fields is a read-only getter in pg-mem.
            return { ...result, rows: arrayRows, fields };
          }

          return result;
        };
      }
      const value = (rawPool as Record<string | symbol, unknown>)[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(rawPool)
        : value;
    },
  }) as unknown as pg.Pool;
}

/**
 * Creates a fresh in-memory database for each test.
 * Call this in beforeEach to get test isolation.
 */
export function createTestDb(): Db {
  const mem = newDb();
  mem.public.none(CREATE_TABLES_SQL);
  const pgAdapters = mem.adapters.createPg();
  const rawPool = new pgAdapters.Pool() as {
    query: (query: PgQueryConfig | string, values?: unknown[]) => Promise<PgResult>;
  };
  const pool = wrapPoolForPgMem(rawPool);
  return createDb(pool);
}

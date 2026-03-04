import {
  pgTable,
  uuid,
  text,
  integer,
  bigserial,
  bigint,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── owners ────────────────────────────────────────────────────────────────

export const owners = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").unique().notNull(),
  pubkey: text("pubkey").unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── agents ────────────────────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: an agent can be registered before an owner record is established.
  ownerId: uuid("owner_id").references(() => owners.id),
  displayName: text("display_name").notNull(),
  personaTags: text("persona_tags").array().notNull().default([]),
  capabilities: jsonb("capabilities")
    .$type<Array<{ name: string; version: string }>>()
    .notNull()
    .default([]),
  visibility: text("visibility").notNull().default("public"),
  pubkey: text("pubkey").unique().notNull(),
  level: integer("level").notNull().default(1),
  badges: text("badges").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── pairings ──────────────────────────────────────────────────────────────

export type VisibilityType = "public" | "paired_only" | "private";

export type PairingStatus = "pending" | "active" | "revoked";

export const pairings = pgTable("pairings", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentAId: uuid("agent_a_id")
    .references(() => agents.id)
    .notNull(),
  agentBId: uuid("agent_b_id")
    .references(() => agents.id)
    .notNull(),
  status: text("status").$type<PairingStatus>().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── events (append-only) ──────────────────────────────────────────────────

export const events = pgTable("events", {
  serverSeq: bigserial("server_seq", { mode: "bigint" }).primaryKey(),
  eventId: uuid("event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  senderPubkey: text("sender_pubkey").notNull(),
  recipientIds: text("recipient_ids").array().notNull().default([]),
  nonce: text("nonce").notNull(),
  sig: text("sig").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── gene_packs (Phase 2/3 shell) ──────────────────────────────────────────

export const genePacks = pgTable("gene_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAgentId: uuid("owner_agent_id")
    .references(() => agents.id)
    .notNull(),
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  summary: text("summary").notNull().default(""),
  permissionsRequired: jsonb("permissions_required").notNull().default({}),
  state: text("state").notNull().default("unverified"),
  artifactHash: text("artifact_hash").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── lineage_events (Phase 3 shell) ────────────────────────────────────────

export const lineageEvents = pgTable("lineage_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  parentGenepackA: uuid("parent_genepack_a")
    .references(() => genePacks.id)
    .notNull(),
  parentGenepackB: uuid("parent_genepack_b")
    .references(() => genePacks.id)
    .notNull(),
  childGenepack: uuid("child_genepack")
    .references(() => genePacks.id)
    .notNull(),
  approverASig: text("approver_a_sig").notNull(),
  approverBSig: text("approver_b_sig").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── trials (Phase 2 — Prompt Brawl) ──────────────────────────────────────

export type TrialStatus = "created" | "started" | "reported" | "settled" | "timeout";

export const trials = pgTable("trials", {
  id: uuid("id").primaryKey().defaultRandom(),
  pairId: uuid("pair_id")
    .references(() => pairings.id)
    .notNull(),
  ruleId: text("rule_id").notNull(),
  rulePayload: jsonb("rule_payload").notNull().default({}),
  seed: text("seed").notNull(),
  status: text("status").$type<TrialStatus>().notNull().default("created"),
  createdBy: uuid("created_by")
    .references(() => agents.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

// ─── trial_results ────────────────────────────────────────────────────────

export const trialResults = pgTable("trial_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  trialId: uuid("trial_id")
    .references(() => trials.id)
    .notNull()
    .unique(),
  winnerAgentId: uuid("winner_agent_id")
    .references(() => agents.id)
    .notNull(),
  loserAgentId: uuid("loser_agent_id")
    .references(() => agents.id)
    .notNull(),
  ruleId: text("rule_id").notNull(),
  triggerEventId: text("trigger_event_id").notNull(),
  transcriptDigest: text("transcript_digest").notNull(),
  sigWinner: text("sig_winner").notNull(),
  sigLoser: text("sig_loser").notNull(),
  xpWinner: integer("xp_winner").notNull().default(100),
  xpLoser: integer("xp_loser").notNull().default(25),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── agent_stats ──────────────────────────────────────────────────────────

export const agentStats = pgTable("agent_stats", {
  agentId: uuid("agent_id")
    .references(() => agents.id)
    .primaryKey(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── offline_messages (optional TTL store for msg.relay) ───────────────────

export const offlineMessages = pgTable("offline_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverSeq: bigint("server_seq", { mode: "bigint" })
    .notNull()
    .references(() => events.serverSeq),
  pairId: uuid("pair_id")
    .notNull()
    .references(() => pairings.id),
  senderPubkey: text("sender_pubkey").notNull(),
  ciphertext: text("ciphertext").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ─── Type exports ──────────────────────────────────────────────────────────

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Pairing = typeof pairings.$inferSelect;
export type NewPairing = typeof pairings.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type GenePack = typeof genePacks.$inferSelect;
export type NewGenePack = typeof genePacks.$inferInsert;

export type LineageEvent = typeof lineageEvents.$inferSelect;
export type NewLineageEvent = typeof lineageEvents.$inferInsert;

export type Trial = typeof trials.$inferSelect;
export type NewTrial = typeof trials.$inferInsert;

export type TrialResult = typeof trialResults.$inferSelect;
export type NewTrialResult = typeof trialResults.$inferInsert;

export type AgentStat = typeof agentStats.$inferSelect;
export type NewAgentStat = typeof agentStats.$inferInsert;

export type OfflineMessage = typeof offlineMessages.$inferSelect;
export type NewOfflineMessage = typeof offlineMessages.$inferInsert;

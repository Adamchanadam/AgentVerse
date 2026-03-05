/**
 * AgentVerse shared types — pure TypeScript interfaces.
 * These are the canonical type definitions; Zod schemas in schemas.ts mirror them.
 */

import type { TrialRule, SignedVerdict } from "./trial-types.js";

// ─── Event Types ───────────────────────────────────────────────

/** MVP event types (Phase 0+1 + Phase 2 trials) */
export type EventType =
  | "agent.registered"
  | "agent.updated"
  | "pair.requested"
  | "pair.approved"
  | "pair.revoked"
  | "msg.relay"
  | "trials.created"
  | "trials.started"
  | "trials.reported"
  | "trials.settled";

/** Phase 3 event types (not yet implemented) */
export type FutureEventType = "genepack.offered" | "genepack.accepted" | "lineage.appended";

// ─── Event Payloads ────────────────────────────────────────────

export interface AgentCardPayload {
  display_name: string;
  persona_tags: string[];
  capabilities: Array<{ name: string; version: string }>;
  visibility: "public" | "paired_only" | "private";
}

export interface PairRequestedPayload {
  target_agent_id: string;
  message?: string;
}

export interface PairApprovedPayload {
  pair_id: string;
  requester_agent_id: string;
}

export interface PairRevokedPayload {
  pair_id: string;
  reason?: string;
}

export interface MsgRelayPayload {
  pair_id: string;
  /** base64-encoded: nonce (24 bytes) ‖ ciphertext ‖ tag (16 bytes) */
  ciphertext: string;
  /** hex-encoded X25519 ephemeral public key, per-message */
  ephemeral_pubkey: string;
}

// ─── Trial Event Payloads (Phase 2 — Prompt Brawl) ──────────

export interface TrialsCreatedPayload {
  pair_id: string;
  rule_id: string;
  seed: string;
}

export interface TrialsStartedPayload {
  trial_id: string;
  rule_payload: TrialRule;
  challenger_agent_id: string;
}

export interface TrialsReportedPayload {
  trial_id: string;
  signed_verdict: SignedVerdict;
}

export interface TrialsSettledPayload {
  trial_id: string;
  winner_agent_id: string;
  loser_agent_id: string;
  xp_winner: number;
  xp_loser: number;
}

export type EventPayload =
  | AgentCardPayload
  | PairRequestedPayload
  | PairApprovedPayload
  | PairRevokedPayload
  | MsgRelayPayload
  | TrialsCreatedPayload
  | TrialsStartedPayload
  | TrialsReportedPayload
  | TrialsSettledPayload;

// ─── Event Envelope ────────────────────────────────────────────

export interface EventEnvelope {
  /** UUID v4 */
  event_id: string;
  event_type: EventType;
  /** ISO 8601 UTC */
  ts: string;
  /** hex-encoded public key */
  sender_pubkey: string;
  recipient_ids: string[];
  /** hex-encoded random 16 bytes */
  nonce: string;
  /** hex-encoded signature over event_id + event_type + ts + nonce + payload_hash */
  sig: string;
  payload: EventPayload;
}

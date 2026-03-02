/**
 * WebSocket frame types for Plugin ↔ Hub communication.
 */

import type { EventEnvelope } from "./types.js";

// ─── Auth ──────────────────────────────────────────────────────

export interface AuthPayload {
  /** hex-encoded public key */
  pubkey: string;
  /** hex-encoded signature of nonce */
  sig: string;
  /** bigint as string, for catchup on reconnect */
  last_seen_server_seq?: string;
}

export interface AuthOkPayload {
  agent_id: string;
  /** ISO 8601 UTC */
  server_time: string;
}

// ─── Ack Frames ────────────────────────────────────────────────

/**
 * Hub → sender Plugin: submission result.
 * Does NOT affect any cursor.
 */
export interface SubmitResultFrame {
  server_seq?: string;
  event_id: string;
  /** ISO 8601 UTC */
  result_ts: string;
  status: "accepted" | "rejected";
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Receiver Plugin → Hub: event consumed successfully.
 * Drives last_seen_server_seq cursor forward.
 */
export interface ConsumerAckFrame {
  /** bigint as string */
  server_seq: string;
  event_id: string;
}

// ─── WsFrame Union ─────────────────────────────────────────────

export type WsFrame =
  | { type: "challenge"; nonce: string }
  | { type: "auth"; payload: AuthPayload }
  | { type: "auth_ok"; payload: AuthOkPayload }
  | { type: "auth_error"; error: string }
  | { type: "submit_event"; payload: EventEnvelope }
  | { type: "event"; payload: EventEnvelope; server_seq: string }
  | { type: "submit_result"; payload: SubmitResultFrame }
  | { type: "consumer_ack"; payload: ConsumerAckFrame }
  | { type: "error"; code: string; message: string }
  | { type: "catchup_start"; from_seq: string }
  | { type: "catchup_end" }
  | { type: "ping" }
  | { type: "pong" };

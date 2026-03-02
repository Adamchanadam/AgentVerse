/**
 * Catchup service — replays missed events on Plugin reconnect.
 *
 * For MVP this is a thin wrapper around EventRepository.findRange().
 * It covers metadata events (agent.*, pair.*). Zero-persistence msg.relay
 * events are never stored, so they will not appear (correct per spec).
 * TTL-mode msg.relay has placeholder rows in events + ciphertext in
 * offline_messages — the joining logic will be handled at the ws-plugin
 * level later.
 */
import type { Event } from "../../db/schema.js";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";

export interface CatchupOptions {
  afterSeq: bigint;
  limit: number;
  eventRepo: EventRepository;
  ttlDays: number;
  offlineMsgRepo: OfflineMessageRepository;
}

/**
 * Returns events with server_seq > afterSeq in ascending order.
 * The caller (ws-plugin) uses this on reconnect to replay what the
 * Plugin missed while disconnected.
 */
export async function getCatchupEvents(opts: CatchupOptions): Promise<Event[]> {
  return opts.eventRepo.findRange(opts.afterSeq, opts.limit);
}

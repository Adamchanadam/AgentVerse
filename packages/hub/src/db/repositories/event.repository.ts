/**
 * EventRepository — append-only access to the events table.
 *
 * INVARIANT: This class intentionally exposes NO update or delete methods.
 * The events table is append-only by design (Property 22).
 * A DB-level trigger in 0001_append_only_events.sql provides belt-and-suspenders
 * enforcement in production PostgreSQL.
 */
import { eq, gt, asc } from "drizzle-orm";
import { events, type Event } from "../schema.js";
import type { Db } from "../index.js";

export interface EventInsertData {
  eventId: string;
  eventType: string;
  ts: Date;
  senderPubkey: string;
  recipientIds: string[];
  nonce: string;
  sig: string;
  payload: Record<string, unknown>;
}

export class EventRepository {
  constructor(private readonly db: Db) {}

  /**
   * Insert a new event. server_seq is assigned by the DB (BIGSERIAL/sequence).
   * Throws on duplicate event_id (unique constraint violation) — callers should
   * treat this as an idempotency signal and return the existing event's server_seq.
   */
  async insert(data: EventInsertData): Promise<Event> {
    const [row] = await this.db
      .insert(events)
      .values({
        eventId: data.eventId,
        eventType: data.eventType,
        ts: data.ts,
        senderPubkey: data.senderPubkey,
        recipientIds: data.recipientIds,
        nonce: data.nonce,
        sig: data.sig,
        payload: data.payload,
      })
      .returning();
    return row;
  }

  async findByEventId(eventId: string): Promise<Event | null> {
    const [row] = await this.db.select().from(events).where(eq(events.eventId, eventId)).limit(1);
    return row ?? null;
  }

  /**
   * Find events with server_seq strictly greater than afterSeq.
   * Used for catchup: Plugin provides last_seen_server_seq, Hub returns missing events.
   * Returns events in ascending server_seq order.
   */
  async findRange(afterSeq: bigint, limit: number): Promise<Event[]> {
    return this.db
      .select()
      .from(events)
      .where(gt(events.serverSeq, afterSeq))
      .orderBy(asc(events.serverSeq))
      .limit(limit);
  }

  // NOTE: No update(), delete(), or deleteById() methods.
  // This is intentional — events table is append-only.
}

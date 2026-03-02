import { eq, gt, and, lt, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { offlineMessages, type OfflineMessage } from "../schema.js";
import type { Db } from "../index.js";

export interface OfflineMessageInsertData {
  serverSeq: bigint;
  pairId: string;
  senderPubkey: string;
  ciphertext: string;
  expiresAt: Date;
}

export class OfflineMessageRepository {
  constructor(private readonly db: Db) {}

  async insert(data: OfflineMessageInsertData): Promise<OfflineMessage> {
    const [row] = await this.db
      .insert(offlineMessages)
      .values({
        id: randomUUID(),
        serverSeq: data.serverSeq,
        pairId: data.pairId,
        senderPubkey: data.senderPubkey,
        ciphertext: data.ciphertext,
        expiresAt: data.expiresAt,
      })
      .returning();
    return row;
  }

  /**
   * Find unexpired offline messages for a pairing, with server_seq > afterSeq.
   * Used for catchup: returns messages a reconnecting Plugin missed.
   * Returns results in ascending server_seq order (Property 25).
   */
  async findCatchup(afterSeq: bigint, pairId: string, limit: number): Promise<OfflineMessage[]> {
    return this.db
      .select()
      .from(offlineMessages)
      .where(
        and(
          eq(offlineMessages.pairId, pairId),
          gt(offlineMessages.serverSeq, afterSeq),
          gt(offlineMessages.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(offlineMessages.serverSeq))
      .limit(limit);
  }

  /**
   * Hard-delete all messages past their expires_at.
   * Intended to be called by a periodic cleanup job.
   * Returns the number of rows deleted.
   */
  async deleteExpired(): Promise<number> {
    const rows = await this.db
      .delete(offlineMessages)
      .where(lt(offlineMessages.expiresAt, new Date()))
      .returning({ id: offlineMessages.id });
    return rows.length;
  }
}

/**
 * ServerSeqCursorManager -- persists last_seen_server_seq for reconnection catchup.
 *
 * CRITICAL INVARIANT: Cursor ONLY advances on consumer_ack.
 * submit_result does NOT affect the cursor.
 *
 * Spec: tasks.md 10.6, Requirement 2.7
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export class ServerSeqCursorManager {
  private cursor: bigint;
  private readonly storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.cursor = this.loadFromDisk();
  }

  /** Current cursor value as string (bigint). */
  get current(): string {
    return this.cursor.toString();
  }

  /**
   * Advance cursor after a successful consumer_ack.
   * Only advances if newSeq > current (monotonic).
   */
  ack(serverSeq: string): void {
    const newSeq = BigInt(serverSeq);
    if (newSeq > this.cursor) {
      this.cursor = newSeq;
      this.saveToDisk();
    }
  }

  /**
   * Called when receiving a submit_result frame.
   * Explicitly does NOT affect cursor -- this is by design.
   */
  onSubmitResult(_serverSeq: string): void {
    // No-op. submit_result does NOT advance cursor.
  }

  private loadFromDisk(): bigint {
    if (existsSync(this.storagePath)) {
      const raw = readFileSync(this.storagePath, "utf-8").trim();
      try {
        return BigInt(raw);
      } catch {
        return 0n;
      }
    }
    return 0n;
  }

  private saveToDisk(): void {
    const dir = dirname(this.storagePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.storagePath, this.cursor.toString(), "utf-8");
  }
}

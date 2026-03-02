/**
 * Plugin-side event deduplication cache.
 *
 * Uses time-window + LRU to discard already-processed events.
 * When Hub sends duplicate events (catchup replays, reconnects),
 * the Plugin checks this cache before processing.
 *
 * Spec: tasks.md 10.4, Requirement 4.5
 */

export class EventDeduplicationCache {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly seen = new Map<string, number>(); // event_id -> timestamp

  constructor(maxSize = 10_000, ttlMs = 300_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Check if an event_id is new (not seen before or expired).
   * If new, marks it as seen and returns true.
   * If duplicate, returns false.
   */
  check(eventId: string): boolean {
    this.evictExpired();
    if (this.seen.has(eventId)) return false;
    if (this.seen.size >= this.maxSize) this.evictOldest();
    this.seen.set(eventId, Date.now());
    return true;
  }

  /** Number of entries currently in cache. */
  get size(): number {
    return this.seen.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.seen.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, ts] of this.seen) {
      if (now - ts > this.ttlMs) {
        this.seen.delete(key);
      } else {
        break; // Map maintains insertion order, so once we hit a non-expired entry, all later ones are newer
      }
    }
  }

  private evictOldest(): void {
    const oldest = this.seen.keys().next().value;
    if (oldest !== undefined) {
      this.seen.delete(oldest);
    }
  }
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Used for per-operation WS rate limits (AgentCard, pairing).
 */

interface BucketEntry {
  timestamps: number[];
}

export class SlidingWindowLimiter {
  private buckets = new Map<string, BucketEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request is allowed, false if rate-limited. */
  tryAcquire(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.buckets.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.buckets.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }
}

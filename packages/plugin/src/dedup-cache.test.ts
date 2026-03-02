import { describe, it, expect, vi, afterEach } from "vitest";
import { EventDeduplicationCache } from "./dedup-cache.js";

describe("EventDeduplicationCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for new event_id", () => {
    const cache = new EventDeduplicationCache();
    expect(cache.check("evt-1")).toBe(true);
  });

  it("returns false for duplicate event_id", () => {
    const cache = new EventDeduplicationCache();
    cache.check("evt-1");
    expect(cache.check("evt-1")).toBe(false);
  });

  it("returns true for expired event_id", () => {
    vi.useFakeTimers();
    const cache = new EventDeduplicationCache(100, 1000); // 1s TTL
    cache.check("evt-1");
    vi.advanceTimersByTime(1500); // advance past TTL
    expect(cache.check("evt-1")).toBe(true);
    vi.useRealTimers();
  });

  it("evicts oldest when maxSize reached", () => {
    const cache = new EventDeduplicationCache(3, 300_000);
    cache.check("a");
    cache.check("b");
    cache.check("c");
    expect(cache.size).toBe(3);
    cache.check("d"); // should evict "a"; cache = {b, c, d}
    expect(cache.size).toBe(3);
    expect(cache.check("a")).toBe(true); // "a" was evicted, so it's new again; re-inserts "a", evicts "b"; cache = {c, d, a}
    expect(cache.check("d")).toBe(false); // "d" still in cache
    expect(cache.check("c")).toBe(false); // "c" still in cache
  });

  it("size getter reflects current count", () => {
    const cache = new EventDeduplicationCache();
    expect(cache.size).toBe(0);
    cache.check("x");
    cache.check("y");
    expect(cache.size).toBe(2);
  });

  it("clear() removes all entries", () => {
    const cache = new EventDeduplicationCache();
    cache.check("a");
    cache.check("b");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.check("a")).toBe(true);
  });
});

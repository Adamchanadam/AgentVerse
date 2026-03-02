import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SlidingWindowLimiter } from "./rate-limiter.js";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = new SlidingWindowLimiter(3, 60_000); // 3 per minute
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
  });

  it("rejects requests exceeding the limit", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    limiter.tryAcquire("agent-1");
    limiter.tryAcquire("agent-1");
    expect(limiter.tryAcquire("agent-1")).toBe(false);
  });

  it("resets after the window expires", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    limiter.tryAcquire("agent-1");
    expect(limiter.tryAcquire("agent-1")).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
  });

  it("tracks different keys independently", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-2")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(false);
  });
});

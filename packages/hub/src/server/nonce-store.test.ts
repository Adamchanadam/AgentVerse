import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NonceStore } from "./nonce-store.js";

describe("NonceStore", () => {
  let store: NonceStore;

  beforeEach(() => {
    store = new NonceStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it("generate() returns a 64-char hex string", () => {
    const nonce = store.generate();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("consume() returns true on first use, false on replay", () => {
    const nonce = store.generate();
    expect(store.consume(nonce)).toBe(true);
    expect(store.consume(nonce)).toBe(false);
  });

  it("consume() returns false for unknown nonce", () => {
    expect(store.consume("0".repeat(64))).toBe(false);
  });

  it("auto-expires nonce after TTL", () => {
    vi.useFakeTimers();
    try {
      const nonce = store.generate();
      expect(store.size).toBe(1);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(store.size).toBe(0);
      expect(store.consume(nonce)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroy() clears all entries", () => {
    store.generate();
    store.generate();
    expect(store.size).toBe(2);
    store.destroy();
    expect(store.size).toBe(0);
  });

  it("size tracks active nonces correctly", () => {
    expect(store.size).toBe(0);
    const n1 = store.generate();
    expect(store.size).toBe(1);
    store.generate();
    expect(store.size).toBe(2);
    store.consume(n1);
    expect(store.size).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculateBackoff } from "./backoff.js";

describe("P7: Exponential backoff reconnection", () => {
  it("zero-jitter delay matches formula min(1000 * 2^(N-1), 60000)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
        const delay = calculateBackoff(attempt, () => 0);
        const expected = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
        expect(delay).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("with default jitter, delay >= base delay", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
        const delay = calculateBackoff(attempt);
        const base = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
        expect(delay).toBeGreaterThanOrEqual(base);
      }),
      { numRuns: 100 },
    );
  });

  it("delay never exceeds max + 10% jitter ceiling", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
        const delay = calculateBackoff(attempt);
        expect(delay).toBeLessThanOrEqual(66000); // 60000 + 10%
      }),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { EventDeduplicationCache } from "./dedup-cache.js";

describe("P4: Event deduplication (Plugin-side)", () => {
  it("first check is always true, second check of same id is always false", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 50 }), (ids) => {
        const cache = new EventDeduplicationCache(10000, 300_000);
        for (const id of ids) {
          expect(cache.check(id)).toBe(true); // first time -> new
          expect(cache.check(id)).toBe(false); // second time -> duplicate
        }
      }),
      { numRuns: 50 },
    );
  });

  it("N unique ids all return true on first check", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 100 }), (ids) => {
        const cache = new EventDeduplicationCache(10000, 300_000);
        const results = ids.map((id) => cache.check(id));
        expect(results.every((r) => r === true)).toBe(true);
        expect(cache.size).toBe(ids.length);
      }),
      { numRuns: 50 },
    );
  });
});

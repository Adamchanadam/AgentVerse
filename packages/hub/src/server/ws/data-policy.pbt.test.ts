/**
 * Property-Based Test for data policy: P11 Data Minimization.
 *
 * P11 — Data Minimization: payloads with extra non-whitelisted fields are rejected;
 *        payloads with path separators in string fields are rejected.
 *
 * Feature: agentverse, Property 11: Data Minimization
 * Validates: Requirements HC2 (Hub stores only metadata, no workspace/paths/tokens)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validatePayload } from "./data-policy.js";

describe("Property 11: Data Minimization", () => {
  it("payloads with extra non-whitelisted fields are rejected", () => {
    fc.assert(
      fc.property(
        fc.record({
          display_name: fc.string({ minLength: 1, maxLength: 50 }),
          persona_tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          capabilities: fc.constant([]),
          visibility: fc.constantFrom("public", "paired_only", "private"),
          // Extra field that should trigger rejection
          extra_field: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        (payload) => {
          const result = validatePayload(
            "agent.registered",
            payload as unknown as Record<string, unknown>,
          );
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain("Unexpected field");
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it("payloads with path separators in strings are rejected", () => {
    fc.assert(
      fc.property(fc.constantFrom("/etc/passwd", "..\\windows", "foo/bar", "a\\b"), (badName) => {
        const payload = {
          display_name: badName,
          persona_tags: [],
          capabilities: [],
          visibility: "public",
        };
        const result = validatePayload(
          "agent.registered",
          payload as unknown as Record<string, unknown>,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain("path separator");
        }
      }),
      { numRuns: 20 },
    );
  });
});

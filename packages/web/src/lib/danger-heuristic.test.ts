import { describe, it, expect } from "vitest";
import { computeDanger } from "./danger-heuristic.js";
import type { TrialRule } from "@agentverse/shared";

const FORBIDDEN_RULE: TrialRule = {
  id: "fw_hello",
  type: "forbidden_word",
  pattern: "hello",
  display_hint: "h____",
  difficulty: 1,
};

const REGEX_RULE: TrialRule = {
  id: "rx_test",
  type: "regex",
  pattern: "foo.*bar",
  display_hint: "f__b__",
  difficulty: 2,
};

describe("computeDanger", () => {
  it("returns 1.0 when forbidden word is fully present", () => {
    expect(computeDanger("say hello there", FORBIDDEN_RULE)).toBe(1);
  });

  it("returns value between 0 and 1 for partial overlap", () => {
    const d = computeDanger("say hel friend", FORBIDDEN_RULE);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });

  it("returns 0 when no overlap at all", () => {
    // Words must have zero character overlap with "hello" (h,e,l,o)
    expect(computeDanger("just a quick trip", FORBIDDEN_RULE)).toBe(0);
  });

  it("returns 0 for empty text", () => {
    expect(computeDanger("", FORBIDDEN_RULE)).toBe(0);
  });

  it("returns 0 for regex rules (no gradient)", () => {
    expect(computeDanger("foobar", REGEX_RULE)).toBe(0);
  });

  it("handles single-character overlap correctly", () => {
    const d = computeDanger("h", FORBIDDEN_RULE);
    // "h" overlaps 1 char of "hello" (5 chars) = 0.2
    expect(d).toBeCloseTo(0.2, 1);
  });
});

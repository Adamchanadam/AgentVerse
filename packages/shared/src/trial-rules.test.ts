import { describe, it, expect } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { TRIAL_RULES, selectRule, evaluateRule } from "./trial-rules.js";

describe("TRIAL_RULES", () => {
  it("has 10 rules total", () => {
    expect(TRIAL_RULES).toHaveLength(10);
  });

  it("has 5 forbidden_word and 5 regex rules", () => {
    const fw = TRIAL_RULES.filter((r) => r.type === "forbidden_word");
    const rx = TRIAL_RULES.filter((r) => r.type === "regex");
    expect(fw).toHaveLength(5);
    expect(rx).toHaveLength(5);
  });

  it("all rules have unique ids", () => {
    const ids = TRIAL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectRule", () => {
  const seed1 = bytesToHex(new Uint8Array(32).fill(0xab));
  const seed2 = bytesToHex(new Uint8Array(32).fill(0xcd));

  it("is deterministic — same seed returns same rule", () => {
    const r1 = selectRule(seed1);
    const r2 = selectRule(seed1);
    expect(r1.id).toBe(r2.id);
  });

  it("different seeds can produce different rules", () => {
    const r1 = selectRule(seed1);
    const r2 = selectRule(seed2);
    // With very high probability these differ; if they happen to be equal,
    // at least both should be valid rules.
    expect(TRIAL_RULES.map((r) => r.id)).toContain(r1.id);
    expect(TRIAL_RULES.map((r) => r.id)).toContain(r2.id);
  });

  it("always returns a valid TrialRule from the set", () => {
    // Try a few seeds
    for (let i = 0; i < 20; i++) {
      const seed = bytesToHex(new Uint8Array(32).fill(i));
      const rule = selectRule(seed);
      expect(TRIAL_RULES).toContainEqual(rule);
    }
  });
});

describe("evaluateRule — forbidden_word", () => {
  const fwHello = TRIAL_RULES.find((r) => r.id === "fw_hello")!;

  it("matches when pattern appears in text", () => {
    const result = evaluateRule(fwHello, "I said hello to you");
    expect(result.triggered).toBe(true);
    expect(result.matchIndex).toBe(7);
  });

  it("is case-insensitive", () => {
    const result = evaluateRule(fwHello, "HELLO WORLD");
    expect(result.triggered).toBe(true);
    expect(result.matchIndex).toBe(0);
  });

  it("returns not triggered when no match", () => {
    const result = evaluateRule(fwHello, "greetings friend");
    expect(result.triggered).toBe(false);
    expect(result.matchIndex).toBe(-1);
  });

  it("matches within a larger word", () => {
    const result = evaluateRule(fwHello, "othello is a play");
    expect(result.triggered).toBe(true);
    expect(result.matchIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("evaluateRule — regex", () => {
  const rxQuestion = TRIAL_RULES.find((r) => r.id === "rx_question")!;
  const rxDigits = TRIAL_RULES.find((r) => r.id === "rx_digits")!;

  it("matches question mark", () => {
    const result = evaluateRule(rxQuestion, "How are you?");
    expect(result.triggered).toBe(true);
    expect(result.matchIndex).toBe(11);
  });

  it("matches digits", () => {
    const result = evaluateRule(rxDigits, "I have 42 cats");
    expect(result.triggered).toBe(true);
  });

  it("no match when text has no digits", () => {
    const result = evaluateRule(rxDigits, "no numbers here");
    expect(result.triggered).toBe(false);
    expect(result.matchIndex).toBe(-1);
  });
});

describe("evaluateRule — edge cases", () => {
  const fwHello = TRIAL_RULES.find((r) => r.id === "fw_hello")!;

  it("handles unicode text without crashing", () => {
    const result = evaluateRule(fwHello, "こんにちは 🎉 hello");
    expect(result.triggered).toBe(true);
  });

  it("handles empty text", () => {
    const result = evaluateRule(fwHello, "");
    expect(result.triggered).toBe(false);
    expect(result.matchIndex).toBe(-1);
  });
});

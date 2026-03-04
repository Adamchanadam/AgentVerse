/**
 * Prompt Brawl trial rules engine.
 * Spec: PROJECT_MASTER_SPEC §16.6
 *
 * - TRIAL_RULES: static rule set (5 forbidden_word + 5 regex)
 * - selectRule(seed): deterministic rule selection via SHA-256
 * - evaluateRule(rule, text): evaluate whether text triggers the rule
 */

import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes } from "@noble/hashes/utils";
import type { TrialRule } from "./trial-types.js";

// ─── Rule Set ─────────────────────────────────────────────────

export const TRIAL_RULES: readonly TrialRule[] = [
  // forbidden_word rules (difficulty 1-3)
  {
    id: "fw_hello",
    type: "forbidden_word",
    pattern: "hello",
    display_hint: "h____",
    difficulty: 1,
  },
  {
    id: "fw_please",
    type: "forbidden_word",
    pattern: "please",
    display_hint: "p_____",
    difficulty: 1,
  },
  {
    id: "fw_sorry",
    type: "forbidden_word",
    pattern: "sorry",
    display_hint: "s____",
    difficulty: 2,
  },
  {
    id: "fw_maybe",
    type: "forbidden_word",
    pattern: "maybe",
    display_hint: "m____",
    difficulty: 2,
  },
  {
    id: "fw_agree",
    type: "forbidden_word",
    pattern: "agree",
    display_hint: "a____",
    difficulty: 3,
  },
  // regex rules (difficulty 3-5)
  {
    id: "rx_question",
    type: "regex",
    pattern: "\\?",
    display_hint: "no questions",
    difficulty: 3,
  },
  {
    id: "rx_digits",
    type: "regex",
    pattern: "\\d+",
    display_hint: "no numbers",
    difficulty: 3,
  },
  {
    id: "rx_exclaim",
    type: "regex",
    pattern: "!{2,}",
    display_hint: "no double exclaim",
    difficulty: 4,
  },
  {
    id: "rx_allcaps",
    type: "regex",
    pattern: "\\b[A-Z]{4,}\\b",
    display_hint: "no shouting",
    difficulty: 4,
  },
  {
    id: "rx_emoji",
    type: "regex",
    pattern: "[\\u{1F600}-\\u{1F64F}]",
    display_hint: "no emoji",
    difficulty: 5,
  },
] as const;

// ─── Rule Selection ───────────────────────────────────────────

/**
 * Deterministic rule selection: SHA-256(hexToBytes(seed)) → first 4 bytes as uint32 → modulo.
 * Same seed always produces the same rule.
 */
export function selectRule(seed: string): TrialRule {
  const seedBytes = hexToBytes(seed);
  const hash = sha256(seedBytes);
  // Read first 4 bytes as big-endian uint32
  const idx = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
  return TRIAL_RULES[idx % TRIAL_RULES.length];
}

// ─── Rule Evaluation ──────────────────────────────────────────

export interface RuleEvaluationResult {
  triggered: boolean;
  /** Character index of the match, or -1 if no match */
  matchIndex: number;
}

/**
 * Evaluate whether text triggers a rule.
 * - forbidden_word: case-insensitive indexOf
 * - regex: RegExp.test with unicode flag
 */
export function evaluateRule(rule: TrialRule, text: string): RuleEvaluationResult {
  if (rule.type === "forbidden_word") {
    const idx = text.toLowerCase().indexOf(rule.pattern.toLowerCase());
    return { triggered: idx >= 0, matchIndex: idx };
  }

  // regex
  const re = new RegExp(rule.pattern, "u");
  const match = re.exec(text);
  return {
    triggered: match !== null,
    matchIndex: match ? match.index : -1,
  };
}

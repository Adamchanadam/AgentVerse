/**
 * Prompt Brawl trial types — reused across types.ts, rules engine, and verdict module.
 * Spec: PROJECT_MASTER_SPEC §16.3, §16.6
 */

// ─── Trial Rule ───────────────────────────────────────────────

export type TrialRuleType = "forbidden_word" | "regex";

export interface TrialRule {
  id: string;
  type: TrialRuleType;
  pattern: string;
  display_hint: string;
  /** 1-5, for rule selection balancing */
  difficulty: number;
}

// ─── Verdict ──────────────────────────────────────────────────

export interface Verdict {
  match_id: string;
  winner_agent_id: string;
  loser_agent_id: string;
  rule_id: string;
  trigger_event_id: string;
  /** hex, hash chain digest */
  transcript_digest: string;
}

export interface SignedVerdict {
  verdict: Verdict;
  /** hex, Ed25519 sig by winner agent */
  sig_winner: string;
  /** hex, Ed25519 sig by loser agent */
  sig_loser: string;
}

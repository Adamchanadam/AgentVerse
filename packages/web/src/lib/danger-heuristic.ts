import type { TrialRule } from "@agentverse/shared";

/** Compute danger level 0-1 based on text proximity to rule trigger */
export function computeDanger(text: string, rule: TrialRule): number {
  if (!text) return 0;
  if (rule.type === "forbidden_word") {
    const pattern = rule.pattern.toLowerCase();
    const lower = text.toLowerCase();
    let maxOverlap = 0;
    for (const word of lower.split(/\s+/)) {
      let overlap = 0;
      for (let len = 1; len <= Math.min(word.length, pattern.length); len++) {
        for (let i = 0; i <= word.length - len; i++) {
          if (pattern.includes(word.substring(i, i + len))) {
            overlap = Math.max(overlap, len);
          }
        }
      }
      maxOverlap = Math.max(maxOverlap, overlap);
    }
    return Math.min(1, maxOverlap / pattern.length);
  }
  // Regex rules: binary (0 or 1), no gradient
  return 0;
}

/**
 * Settlement handler for Prompt Brawl trial reports.
 * Spec: PROJECT_MASTER_SPEC §16.4
 *
 * Verifies dual Ed25519 signatures, transitions trial state,
 * writes results, and updates agent stats.
 */

import { verifyVerdictSignature, type SignedVerdict } from "@agentverse/shared";
import type { TrialsRepository } from "../../db/repositories/trials.repository.js";
import type { TrialResultsRepository } from "../../db/repositories/trial-results.repository.js";
import type { AgentStatsRepository } from "../../db/repositories/agent-stats.repository.js";
import type { AgentRepository } from "../../db/repositories/agent.repository.js";

/** MVP badge IDs — match PNG asset filenames in manifest */
export const BADGE_FIRST_MATCH = "badge_first_match";
export const BADGE_FIRST_WIN = "badge_first_win";
export const BADGE_FIRST_DEFENSE = "badge_first_defense";

export interface SettlementDeps {
  trialsRepo: TrialsRepository;
  trialResultsRepo: TrialResultsRepository;
  agentStatsRepo: AgentStatsRepository;
  agentRepo: AgentRepository;
  /** Look up agent pubkey by agent ID */
  getAgentPubkey: (agentId: string) => Promise<string | null>;
}

export type SettlementResult =
  | {
      ok: true;
      trialId: string;
      winnerId: string;
      loserId: string;
      xpWinner: number;
      xpLoser: number;
      badgesGranted: Record<string, string[]>;
    }
  | { ok: false; code: string; message: string };

const XP_WINNER = 100;
const XP_LOSER = 25;

export async function settleTrialReport(
  signedVerdict: SignedVerdict,
  deps: SettlementDeps,
): Promise<SettlementResult> {
  const { verdict } = signedVerdict;

  // 1. Trial exists + status=started
  const trial = await deps.trialsRepo.getTrial(verdict.match_id);
  if (!trial) {
    return { ok: false, code: "trial_not_found", message: `Trial ${verdict.match_id} not found` };
  }
  if (trial.status !== "started") {
    return {
      ok: false,
      code: "invalid_state",
      message: `Trial ${verdict.match_id} is in state '${trial.status}', expected 'started'`,
    };
  }

  // 2. Look up winner pubkey + verify sig_winner
  const winnerPubkey = await deps.getAgentPubkey(verdict.winner_agent_id);
  if (!winnerPubkey) {
    return {
      ok: false,
      code: "agent_not_found",
      message: `Winner agent ${verdict.winner_agent_id} not found`,
    };
  }
  if (!verifyVerdictSignature(verdict, signedVerdict.sig_winner, winnerPubkey)) {
    return { ok: false, code: "sig_mismatch", message: "Winner signature verification failed" };
  }

  // 3. Look up loser pubkey + verify sig_loser
  const loserPubkey = await deps.getAgentPubkey(verdict.loser_agent_id);
  if (!loserPubkey) {
    return {
      ok: false,
      code: "agent_not_found",
      message: `Loser agent ${verdict.loser_agent_id} not found`,
    };
  }
  if (!verifyVerdictSignature(verdict, signedVerdict.sig_loser, loserPubkey)) {
    return { ok: false, code: "sig_mismatch", message: "Loser signature verification failed" };
  }

  // 4. Transition: started → reported → settled
  await deps.trialsRepo.transitionStatus(trial.id, "started", "reported");
  await deps.trialsRepo.transitionStatus(trial.id, "reported", "settled");

  // 5. Write trial_results
  await deps.trialResultsRepo.createResult({
    trialId: trial.id,
    winnerAgentId: verdict.winner_agent_id,
    loserAgentId: verdict.loser_agent_id,
    ruleId: verdict.rule_id,
    triggerEventId: verdict.trigger_event_id,
    transcriptDigest: verdict.transcript_digest,
    sigWinner: signedVerdict.sig_winner,
    sigLoser: signedVerdict.sig_loser,
    xpWinner: XP_WINNER,
    xpLoser: XP_LOSER,
  });

  // 6. Update agent_stats — read pre-update stats for badge eligibility
  const winnerStatsBefore = await deps.agentStatsRepo.getStats(verdict.winner_agent_id);
  const loserStatsBefore = await deps.agentStatsRepo.getStats(verdict.loser_agent_id);

  await deps.agentStatsRepo.incrementWins(verdict.winner_agent_id);
  await deps.agentStatsRepo.addXp(verdict.winner_agent_id, XP_WINNER);
  await deps.agentStatsRepo.incrementLosses(verdict.loser_agent_id);
  await deps.agentStatsRepo.addXp(verdict.loser_agent_id, XP_LOSER);

  // 7. Badge eligibility check
  const badgesGranted: Record<string, string[]> = {};
  const winnerAgent = await deps.agentRepo.findById(verdict.winner_agent_id);
  const loserAgent = await deps.agentRepo.findById(verdict.loser_agent_id);
  const winnerExisting = new Set(winnerAgent?.badges ?? []);
  const loserExisting = new Set(loserAgent?.badges ?? []);
  const isRuleTrigger = verdict.trigger_event_id !== "timeout";

  // Winner badges
  const winnerNew: string[] = [];
  const winnerTotalBefore = (winnerStatsBefore?.wins ?? 0) + (winnerStatsBefore?.losses ?? 0);
  if (winnerTotalBefore === 0 && !winnerExisting.has(BADGE_FIRST_MATCH)) {
    winnerNew.push(BADGE_FIRST_MATCH);
  }
  if ((winnerStatsBefore?.wins ?? 0) === 0 && !winnerExisting.has(BADGE_FIRST_WIN)) {
    winnerNew.push(BADGE_FIRST_WIN);
  }
  if (isRuleTrigger && !winnerExisting.has(BADGE_FIRST_DEFENSE)) {
    winnerNew.push(BADGE_FIRST_DEFENSE);
  }
  if (winnerNew.length > 0) {
    await deps.agentRepo.addBadges(verdict.winner_agent_id, winnerNew);
    badgesGranted[verdict.winner_agent_id] = winnerNew;
  }

  // Loser badges
  const loserNew: string[] = [];
  const loserTotalBefore = (loserStatsBefore?.wins ?? 0) + (loserStatsBefore?.losses ?? 0);
  if (loserTotalBefore === 0 && !loserExisting.has(BADGE_FIRST_MATCH)) {
    loserNew.push(BADGE_FIRST_MATCH);
  }
  if (loserNew.length > 0) {
    await deps.agentRepo.addBadges(verdict.loser_agent_id, loserNew);
    badgesGranted[verdict.loser_agent_id] = loserNew;
  }

  return {
    ok: true,
    trialId: trial.id,
    winnerId: verdict.winner_agent_id,
    loserId: verdict.loser_agent_id,
    xpWinner: XP_WINNER,
    xpLoser: XP_LOSER,
    badgesGranted,
  };
}

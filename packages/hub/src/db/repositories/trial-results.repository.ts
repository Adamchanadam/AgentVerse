import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { trialResults, type TrialResult } from "../schema.js";
import type { Db } from "../index.js";

export class TrialResultsRepository {
  constructor(private readonly db: Db) {}

  async createResult(data: {
    trialId: string;
    winnerAgentId: string;
    loserAgentId: string;
    ruleId: string;
    triggerEventId: string;
    transcriptDigest: string;
    sigWinner: string;
    sigLoser: string;
    xpWinner?: number;
    xpLoser?: number;
  }): Promise<TrialResult> {
    const [row] = await this.db
      .insert(trialResults)
      .values({
        id: randomUUID(),
        trialId: data.trialId,
        winnerAgentId: data.winnerAgentId,
        loserAgentId: data.loserAgentId,
        ruleId: data.ruleId,
        triggerEventId: data.triggerEventId,
        transcriptDigest: data.transcriptDigest,
        sigWinner: data.sigWinner,
        sigLoser: data.sigLoser,
        xpWinner: data.xpWinner ?? 100,
        xpLoser: data.xpLoser ?? 25,
      })
      .returning();
    return row;
  }

  async getByTrialId(trialId: string): Promise<TrialResult | null> {
    const [row] = await this.db
      .select()
      .from(trialResults)
      .where(eq(trialResults.trialId, trialId))
      .limit(1);
    return row ?? null;
  }
}

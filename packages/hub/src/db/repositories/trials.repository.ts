import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { trials, type Trial, type TrialStatus } from "../schema.js";
import type { Db } from "../index.js";

const VALID_TRIAL_TRANSITIONS: Record<TrialStatus, TrialStatus[]> = {
  created: ["started", "timeout"],
  started: ["reported", "timeout"],
  reported: ["settled"],
  settled: [],
  timeout: [],
};

export class TrialTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrialTransitionError";
  }
}

export class TrialsRepository {
  constructor(private readonly db: Db) {}

  async createTrial(data: {
    pairId: string;
    ruleId: string;
    rulePayload: Record<string, unknown>;
    seed: string;
    createdBy: string;
  }): Promise<Trial> {
    const [row] = await this.db
      .insert(trials)
      .values({
        id: randomUUID(),
        pairId: data.pairId,
        ruleId: data.ruleId,
        rulePayload: data.rulePayload,
        seed: data.seed,
        status: "created",
        createdBy: data.createdBy,
      })
      .returning();
    return row;
  }

  async getTrial(id: string): Promise<Trial | null> {
    const [row] = await this.db.select().from(trials).where(eq(trials.id, id)).limit(1);
    return row ?? null;
  }

  async getByPairId(pairId: string): Promise<Trial[]> {
    return this.db.select().from(trials).where(eq(trials.pairId, pairId));
  }

  async transitionStatus(
    id: string,
    expectedCurrent: TrialStatus,
    next: TrialStatus,
  ): Promise<Trial> {
    const allowed = VALID_TRIAL_TRANSITIONS[expectedCurrent];
    if (!allowed.includes(next)) {
      throw new TrialTransitionError(`Illegal trial transition: ${expectedCurrent} → ${next}`);
    }

    const now = new Date();
    const setFields: Record<string, unknown> = { status: next };
    if (next === "started") setFields.startedAt = now;
    if (next === "settled") setFields.settledAt = now;

    const [updated] = await this.db
      .update(trials)
      .set(setFields)
      .where(and(eq(trials.id, id), eq(trials.status, expectedCurrent)))
      .returning();

    if (!updated) {
      throw new TrialTransitionError(
        `Trial ${id} is not in expected state '${expectedCurrent}' (concurrent modification or not found)`,
      );
    }

    return updated;
  }
}

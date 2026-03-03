import { eq, and, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { pairings, type Pairing, type PairingStatus } from "../schema.js";
import type { Db } from "../index.js";

/** Valid state transitions. Key = from, value = allowed destinations. */
const VALID_TRANSITIONS: Record<PairingStatus, PairingStatus[]> = {
  pending: ["active", "revoked"],
  active: ["revoked"],
  revoked: [],
};

export class PairingTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingTransitionError";
  }
}

export class PairingRepository {
  constructor(private readonly db: Db) {}

  async create(data: { agentAId: string; agentBId: string }): Promise<Pairing> {
    const [row] = await this.db
      .insert(pairings)
      .values({
        id: randomUUID(),
        agentAId: data.agentAId,
        agentBId: data.agentBId,
        status: "pending",
      })
      .returning();
    return row;
  }

  async findById(id: string): Promise<Pairing | null> {
    const [row] = await this.db.select().from(pairings).where(eq(pairings.id, id)).limit(1);
    return row ?? null;
  }

  /** Find an active pairing between two agents (order-independent). */
  async findActiveByAgents(agentAId: string, agentBId: string): Promise<Pairing | null> {
    const [row] = await this.db
      .select()
      .from(pairings)
      .where(
        and(
          eq(pairings.status, "active"),
          or(
            and(eq(pairings.agentAId, agentAId), eq(pairings.agentBId, agentBId)),
            and(eq(pairings.agentAId, agentBId), eq(pairings.agentBId, agentAId)),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Find all pairings where the given agent is either side. */
  async findByAgent(agentId: string): Promise<Pairing[]> {
    return this.db
      .select()
      .from(pairings)
      .where(or(eq(pairings.agentAId, agentId), eq(pairings.agentBId, agentId)));
  }

  /**
   * Check if a pending or active pairing already exists between two agents.
   * Used to reject duplicate pair.requested events.
   */
  async hasPendingOrActive(agentAId: string, agentBId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(pairings)
      .where(
        and(
          or(eq(pairings.status, "pending"), eq(pairings.status, "active")),
          or(
            and(eq(pairings.agentAId, agentAId), eq(pairings.agentBId, agentBId)),
            and(eq(pairings.agentAId, agentBId), eq(pairings.agentBId, agentAId)),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Transition pairing status. Enforces the state machine.
   * @param id - pairing ID
   * @param expectedCurrent - the status we expect the pairing to be in now (optimistic lock)
   * @param next - the target status
   * @throws PairingTransitionError if the transition is illegal or state doesn't match
   */
  async transitionStatus(
    id: string,
    expectedCurrent: PairingStatus,
    next: PairingStatus,
  ): Promise<Pairing> {
    const allowed = VALID_TRANSITIONS[expectedCurrent];
    if (!allowed.includes(next)) {
      throw new PairingTransitionError(`Illegal pairing transition: ${expectedCurrent} → ${next}`);
    }

    const [updated] = await this.db
      .update(pairings)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(pairings.id, id), eq(pairings.status, expectedCurrent)))
      .returning();

    if (!updated) {
      throw new PairingTransitionError(
        `Pairing ${id} is not in expected state '${expectedCurrent}' (concurrent modification or not found)`,
      );
    }

    return updated;
  }
}

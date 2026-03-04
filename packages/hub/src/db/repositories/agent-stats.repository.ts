import { eq, sql } from "drizzle-orm";
import { agentStats, type AgentStat } from "../schema.js";
import type { Db } from "../index.js";

export class AgentStatsRepository {
  constructor(private readonly db: Db) {}

  async getStats(agentId: string): Promise<AgentStat | null> {
    const [row] = await this.db
      .select()
      .from(agentStats)
      .where(eq(agentStats.agentId, agentId))
      .limit(1);
    return row ?? null;
  }

  async ensureStats(agentId: string): Promise<AgentStat> {
    // Try insert, ignore conflict (already exists)
    await this.db
      .insert(agentStats)
      .values({ agentId, wins: 0, losses: 0, xp: 0 })
      .onConflictDoNothing({ target: agentStats.agentId });
    // Always return current state
    const stat = await this.getStats(agentId);
    return stat!;
  }

  async incrementWins(agentId: string): Promise<AgentStat> {
    await this.ensureStats(agentId);
    const [row] = await this.db
      .update(agentStats)
      .set({
        wins: sql`${agentStats.wins} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(agentStats.agentId, agentId))
      .returning();
    return row;
  }

  async incrementLosses(agentId: string): Promise<AgentStat> {
    await this.ensureStats(agentId);
    const [row] = await this.db
      .update(agentStats)
      .set({
        losses: sql`${agentStats.losses} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(agentStats.agentId, agentId))
      .returning();
    return row;
  }

  async addXp(agentId: string, amount: number): Promise<AgentStat> {
    await this.ensureStats(agentId);
    const [row] = await this.db
      .update(agentStats)
      .set({
        xp: sql`${agentStats.xp} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(agentStats.agentId, agentId))
      .returning();
    return row;
  }
}

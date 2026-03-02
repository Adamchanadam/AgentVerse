import { eq, ilike, and, count } from "drizzle-orm";
import { agents, type Agent, type NewAgent, type VisibilityType } from "../schema.js";
import type { Db } from "../index.js";

export interface AgentUpsertData {
  id: string;
  displayName: string;
  personaTags: string[];
  capabilities: Array<{ name: string; version: string }>;
  visibility: VisibilityType;
  pubkey: string;
  level: number;
  badges: string[];
  ownerId?: string;
}

export class AgentRepository {
  constructor(private readonly db: Db) {}

  /**
   * Insert or update an agent record keyed by pubkey.
   * Called when processing agent.registered or agent.updated events.
   */
  async upsert(data: AgentUpsertData): Promise<Agent> {
    const row: NewAgent = {
      id: data.id,
      ownerId: data.ownerId ?? null,
      displayName: data.displayName,
      personaTags: data.personaTags,
      capabilities: data.capabilities,
      visibility: data.visibility,
      pubkey: data.pubkey,
      level: data.level,
      badges: data.badges,
    };

    const [result] = await this.db
      .insert(agents)
      .values(row)
      .onConflictDoUpdate({
        target: agents.pubkey,
        set: {
          displayName: row.displayName,
          personaTags: row.personaTags,
          capabilities: row.capabilities,
          visibility: row.visibility,
          level: row.level,
          badges: row.badges,
        },
      })
      .returning();

    return result;
  }

  async findById(id: string): Promise<Agent | null> {
    const [row] = await this.db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return row ?? null;
  }

  async findByPubkey(pubkey: string): Promise<Agent | null> {
    const [row] = await this.db.select().from(agents).where(eq(agents.pubkey, pubkey)).limit(1);
    return row ?? null;
  }

  /**
   * Search public agents by display_name (case-insensitive).
   * Empty query returns all public agents.
   * Uses SQL ILIKE for efficient server-side filtering in production PostgreSQL.
   */
  async search(query: string): Promise<Agent[]> {
    if (!query) {
      return this.db.select().from(agents).where(eq(agents.visibility, "public"));
    }
    return this.db
      .select()
      .from(agents)
      .where(and(ilike(agents.displayName, `%${query}%`), eq(agents.visibility, "public")));
  }

  /**
   * Return paginated public agents, optionally filtered by display_name.
   * Used by GET /api/agents.
   */
  async findPaginated(query: string | undefined, limit: number, offset: number): Promise<Agent[]> {
    const condition = query
      ? and(eq(agents.visibility, "public"), ilike(agents.displayName, `%${query}%`))
      : eq(agents.visibility, "public");
    return this.db.select().from(agents).where(condition).limit(limit).offset(offset);
  }

  /**
   * Return the total count of public agents, optionally filtered by display_name.
   * Used by GET /api/agents to populate the real `total` field.
   */
  async countPublic(query?: string): Promise<number> {
    const condition = query
      ? and(eq(agents.visibility, "public"), ilike(agents.displayName, `%${query}%`))
      : eq(agents.visibility, "public");
    const [result] = await this.db.select({ count: count() }).from(agents).where(condition);
    return Number(result?.count ?? 0);
  }
}

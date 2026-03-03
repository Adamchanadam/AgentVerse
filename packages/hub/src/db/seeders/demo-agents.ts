import type { Db } from "../index.js";
import type { AgentUpsertData } from "../repositories/agent.repository.js";
import { AgentRepository } from "../repositories/agent.repository.js";

/** Deterministic demo agent data — idempotent via pubkey upsert. */
export const DEMO_AGENTS: AgentUpsertData[] = [
  {
    id: "de000000-0000-4001-8000-000000000001",
    displayName: "Echo-7",
    personaTags: ["conversational", "helper"],
    capabilities: [{ name: "chat", version: "1.0" }],
    visibility: "public",
    pubkey: "de000001" + "0".repeat(56),
    level: 3,
    badges: ["DEMO"],
  },
  {
    id: "de000000-0000-4002-8000-000000000002",
    displayName: "Cipher-X",
    personaTags: ["security", "analyst"],
    capabilities: [{ name: "audit", version: "1.0" }],
    visibility: "public",
    pubkey: "de000002" + "0".repeat(56),
    level: 5,
    badges: ["DEMO"],
  },
  {
    id: "de000000-0000-4003-8000-000000000003",
    displayName: "Luma",
    personaTags: ["creative", "generative"],
    capabilities: [{ name: "create", version: "1.0" }],
    visibility: "public",
    pubkey: "de000003" + "0".repeat(56),
    level: 2,
    badges: ["DEMO"],
  },
  {
    id: "de000000-0000-4004-8000-000000000004",
    displayName: "Navigator-9",
    personaTags: ["planner", "researcher"],
    capabilities: [
      { name: "search", version: "1.0" },
      { name: "plan", version: "1.0" },
    ],
    visibility: "public",
    pubkey: "de000004" + "0".repeat(56),
    level: 4,
    badges: ["DEMO"],
  },
];

/**
 * Seed demo agents when SEED_DEMO=true. Idempotent — uses pubkey upsert.
 * Returns the number of agents seeded (0 when disabled).
 */
export async function seedDemoAgents(db: Db, seedDemo: boolean): Promise<number> {
  if (!seedDemo) return 0;

  const repo = new AgentRepository(db);
  for (const agent of DEMO_AGENTS) {
    await repo.upsert(agent);
  }

  console.log(`[SEED] Seeded ${DEMO_AGENTS.length} demo agents`);
  return DEMO_AGENTS.length;
}

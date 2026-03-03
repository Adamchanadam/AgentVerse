import type { FastifyInstance } from "fastify";
import { pairings } from "../../db/schema.js";
import {
  PairingRepository,
  PairingTransitionError,
} from "../../db/repositories/pairing.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";

const MVP_PAIRING_LIMIT = 100;

export async function pairingsRoute(app: FastifyInstance): Promise<void> {
  // ─── GET /api/pairings ──────────────────────────────────────────────────
  app.get("/api/pairings", { preHandler: app.authenticate }, async (request) => {
    const identity = request.identity!;

    if (identity.role === "agent") {
      const repo = new PairingRepository(app.db);
      const rows = await repo.findByAgent(identity.agentId);
      return { pairings: rows };
    }

    // Admin: return all, capped
    const rows = await app.db.select().from(pairings).limit(MVP_PAIRING_LIMIT);
    return { pairings: rows };
  });

  // ─── POST /api/pairings ─────────────────────────────────────────────────
  app.post(
    "/api/pairings",
    {
      preHandler: app.authenticate,
      schema: {
        body: {
          type: "object",
          properties: {
            agentAId: { type: "string" },
            agentBId: { type: "string" },
            targetAgentId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const identity = request.identity!;
      const body = request.body as {
        agentAId?: string;
        agentBId?: string;
        targetAgentId?: string;
      };

      let agentAId: string;
      let agentBId: string;

      if (identity.role === "agent") {
        // Agent scope: body { targetAgentId }
        if (!body.targetAgentId) {
          return reply.code(400).send({ error: "targetAgentId is required" });
        }
        agentAId = identity.agentId;
        agentBId = body.targetAgentId;
      } else {
        // Admin scope: body { agentAId, agentBId } (backward compat)
        if (!body.agentAId || !body.agentBId) {
          return reply.code(400).send({ error: "agentAId and agentBId are required" });
        }
        agentAId = body.agentAId;
        agentBId = body.agentBId;
      }

      // Guard: self-pair
      if (agentAId === agentBId) {
        return reply.code(400).send({ error: "Cannot pair with self" });
      }

      // Guard: agents exist + DEMO check
      const agentRepo = new AgentRepository(app.db);
      const [agentA, agentB] = await Promise.all([
        agentRepo.findById(agentAId),
        agentRepo.findById(agentBId),
      ]);

      if (!agentA || !agentB) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      if (agentA.badges.includes("DEMO") || agentB.badges.includes("DEMO")) {
        return reply.code(403).send({ error: "Cannot pair with demo agents" });
      }

      // Guard: duplicate
      const repo = new PairingRepository(app.db);
      const exists = await repo.hasPendingOrActive(agentAId, agentBId);
      if (exists) {
        return reply.code(409).send({ error: "Pairing already exists" });
      }

      const pairing = await repo.create({ agentAId, agentBId });
      return reply.code(201).send({ pairing });
    },
  );

  // ─── PATCH /api/pairings/:id ────────────────────────────────────────────
  app.patch(
    "/api/pairings/:id",
    {
      preHandler: app.authenticate,
      schema: {
        body: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["approve", "revoke", "cancel"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { action } = request.body as { action: "approve" | "revoke" | "cancel" };
      const identity = request.identity!;
      const repo = new PairingRepository(app.db);

      const pairing = await repo.findById(id);
      if (!pairing) {
        return reply.code(404).send({ error: "Pairing not found" });
      }

      // Ownership guards for agent scope
      if (identity.role === "agent") {
        const myId = identity.agentId;
        const isAgentA = pairing.agentAId === myId;
        const isAgentB = pairing.agentBId === myId;

        if (!isAgentA && !isAgentB) {
          return reply.code(403).send({ error: "Not a party to this pairing" });
        }

        if (action === "approve" && !isAgentB) {
          return reply.code(403).send({ error: "Only the responder can approve" });
        }
        if (action === "cancel" && !isAgentA) {
          return reply.code(403).send({ error: "Only the requester can cancel" });
        }
        // revoke: either party OK
      }

      // Determine and execute state transition
      try {
        if (action === "approve") {
          const updated = await repo.transitionStatus(id, "pending", "active");
          return { pairing: updated };
        } else if (action === "cancel") {
          const updated = await repo.transitionStatus(id, "pending", "revoked");
          return { pairing: updated };
        } else {
          // revoke: current status → revoked (works for both pending and active)
          if (pairing.status === "revoked") {
            return reply.code(409).send({ error: "Pairing already revoked" });
          }
          const updated = await repo.transitionStatus(id, pairing.status, "revoked");
          return { pairing: updated };
        }
      } catch (err) {
        if (err instanceof PairingTransitionError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}

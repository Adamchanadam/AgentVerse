import type { FastifyInstance } from "fastify";
import { pairings } from "../../db/schema.js";
import {
  PairingRepository,
  PairingTransitionError,
} from "../../db/repositories/pairing.repository.js";

const MVP_PAIRING_LIMIT = 100;

export async function pairingsRoute(app: FastifyInstance): Promise<void> {
  // ─── GET /api/pairings ──────────────────────────────────────────────────
  app.get("/api/pairings", { preHandler: app.authenticate }, async () => {
    // MVP: hard cap before per-user filtering lands in a later task
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
          required: ["agentAId", "agentBId"],
          properties: {
            agentAId: { type: "string" },
            agentBId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { agentAId, agentBId } = request.body as {
        agentAId: string;
        agentBId: string;
      };
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
            action: { type: "string", enum: ["approve", "revoke"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { action } = request.body as { action: "approve" | "revoke" };
      const repo = new PairingRepository(app.db);

      const pairing = await repo.findById(id);
      if (!pairing) {
        return reply.code(404).send({ error: "Pairing not found" });
      }

      const expectedCurrent = action === "approve" ? "pending" : "active";
      const targetStatus = action === "approve" ? "active" : "revoked";
      try {
        const updated = await repo.transitionStatus(id, expectedCurrent, targetStatus);
        return { pairing: updated };
      } catch (err) {
        if (err instanceof PairingTransitionError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}

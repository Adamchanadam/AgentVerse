import type { FastifyInstance } from "fastify";
import { AgentRepository } from "../../db/repositories/agent.repository.js";

interface AgentListQuery {
  q?: string;
  page?: number;
  limit?: number;
}

export async function agentsRoute(app: FastifyInstance): Promise<void> {
  const repo = new AgentRepository(app.db);

  app.get<{ Querystring: AgentListQuery }>(
    "/api/agents",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request) => {
      const { q, page = 1, limit = 20 } = request.query;
      const safeLimit = Math.min(limit, 100);
      const safeOffset = (page - 1) * safeLimit;
      const [agentList, total] = await Promise.all([
        repo.findPaginated(q, safeLimit, safeOffset),
        repo.countPublic(q),
      ]);
      return { agents: agentList, total, page, limit: safeLimit };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/agents/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const agent = await repo.findById(request.params.id);
      if (!agent) return reply.status(404).send({ error: "Agent not found" });
      return agent;
    },
  );
}

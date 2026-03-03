import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

// ─── Identity types ──────────────────────────────────────────────────────────

export interface AdminIdentity {
  role: "admin";
}

export interface AgentIdentity {
  role: "agent";
  agentId: string;
  pubkey: string;
}

export type RequestIdentity = AdminIdentity | AgentIdentity;

// ─── Plugin ──────────────────────────────────────────────────────────────────

async function authPluginImpl(app: FastifyInstance): Promise<void> {
  app.decorateRequest("identity", null);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        await reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      const claims = request.user as Record<string, unknown>;

      if (
        claims.scope === "agent" &&
        typeof claims.sub === "string" &&
        typeof claims.pubkey === "string"
      ) {
        request.identity = { role: "agent", agentId: claims.sub, pubkey: claims.pubkey };
      } else {
        // Admin JWT ({ sub: "admin", role: "admin" }) or legacy ({ pubkey: "web-user" })
        request.identity = { role: "admin" };
      }
    },
  );
}

export const authPlugin = fp(authPluginImpl);

// ─── TypeScript augmentation ─────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    identity: RequestIdentity | null;
  }
}

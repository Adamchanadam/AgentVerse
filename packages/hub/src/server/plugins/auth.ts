import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

async function authPluginImpl(app: FastifyInstance): Promise<void> {
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        await reply.status(401).send({ error: "Unauthorized" });
      }
    },
  );
}

export const authPlugin = fp(authPluginImpl);

// TypeScript augmentation
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

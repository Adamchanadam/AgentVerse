import { timingSafeEqual, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";

function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function authTokenRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/token",
    {
      schema: {
        body: {
          type: "object",
          required: ["secret"],
          properties: {
            secret: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { secret } = request.body as { secret: string };
      if (!safeCompare(secret, app.config.HUB_ADMIN_SECRET)) {
        return reply.code(401).send({ error: "Invalid secret" });
      }
      const token = app.jwt.sign({ sub: "admin", role: "admin" }, { expiresIn: "8h" });
      return { token };
    },
  );
}

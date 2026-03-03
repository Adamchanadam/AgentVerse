import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { AUTH } from "../auth-constants.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import type { VisibilityType } from "../../db/schema.js";

function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const agentRepo = new AgentRepository(app.db);

  // ─── POST /api/auth/token (existing admin flow) ──────────────────────────

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
      const token = app.jwt.sign(
        { sub: "admin", role: "admin" },
        { expiresIn: AUTH.ADMIN_JWT_EXPIRY },
      );
      return { token };
    },
  );

  // ─── GET /api/auth/nonce ─────────────────────────────────────────────────

  app.get(
    "/api/auth/nonce",
    {
      config: {
        rateLimit: {
          max: AUTH.NONCE_RATE_LIMIT,
          timeWindow: "1 minute",
        },
      },
    },
    async () => {
      const nonce = app.nonceStore.generate();
      return { nonce };
    },
  );

  // ─── POST /api/auth/bootstrap ────────────────────────────────────────────

  app.post(
    "/api/auth/bootstrap",
    {
      config: {
        rateLimit: {
          max: AUTH.BOOTSTRAP_RATE_LIMIT,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["pubkey", "signature", "nonce"],
          properties: {
            pubkey: { type: "string", pattern: "^[0-9a-f]{64}$" },
            signature: { type: "string", pattern: "^[0-9a-f]{128}$" },
            nonce: { type: "string", pattern: "^[0-9a-f]{64}$" },
            display_name: { type: "string", minLength: 1, maxLength: 64 },
            persona_tags: {
              type: "array",
              items: { type: "string", maxLength: 32 },
              maxItems: 10,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey, signature, nonce, display_name, persona_tags } = request.body as {
        pubkey: string;
        signature: string;
        nonce: string;
        display_name?: string;
        persona_tags?: string[];
      };

      // 1. Consume nonce (one-time)
      if (!app.nonceStore.consume(nonce)) {
        return reply.code(401).send({ error: "Invalid or expired nonce" });
      }

      // 2. Verify Ed25519 signature over "agentverse:<nonce>"
      const message = utf8ToBytes(AUTH.NONCE_PREFIX + nonce);
      let valid: boolean;
      try {
        valid = ed25519.verify(hexToBytes(signature), message, hexToBytes(pubkey));
      } catch {
        valid = false;
      }
      if (!valid) {
        return reply.code(401).send({ error: "Invalid signature" });
      }

      // 3. Find or create agent by pubkey
      const existing = await agentRepo.findByPubkey(pubkey);
      const isNew = !existing;

      const agent = await agentRepo.upsert({
        id: existing?.id ?? randomUUID(),
        displayName: existing?.displayName ?? display_name ?? `Agent-${pubkey.slice(0, 8)}`,
        personaTags: existing?.personaTags ?? persona_tags ?? [],
        capabilities: existing?.capabilities ?? [],
        visibility: (existing?.visibility as VisibilityType) ?? "public",
        pubkey,
        level: existing?.level ?? 1,
        badges: existing?.badges ?? [],
      });

      // 4. Sign agent-scoped JWT
      const token = app.jwt.sign(
        { sub: agent.id, pubkey, scope: "agent" },
        { expiresIn: AUTH.AGENT_JWT_EXPIRY },
      );

      return {
        jwt: token,
        agent_id: agent.id,
        agent_card: {
          id: agent.id,
          displayName: agent.displayName,
          personaTags: agent.personaTags,
          level: agent.level,
          badges: agent.badges,
        },
        is_new: isNew,
      };
    },
  );
}

// Keep legacy named export for backward compat (if anything imports it)
export const authTokenRoute = authRoutes;

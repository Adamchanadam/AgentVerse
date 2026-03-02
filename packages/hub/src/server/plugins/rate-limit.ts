import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { HubConfig } from "../../env.js";

interface RateLimitPluginOptions {
  config: HubConfig;
}

async function rateLimitPluginImpl(
  app: FastifyInstance,
  opts: RateLimitPluginOptions,
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: opts.config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (req: FastifyRequest) =>
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.ip ??
      "unknown",
    errorResponseBuilder: (_req, context) => ({
      statusCode: context.statusCode,
      error: "rate_limit_exceeded",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retry_after: Math.ceil(context.ttl / 1000),
    }),
  });
}

export const rateLimitPlugin = fp(rateLimitPluginImpl);

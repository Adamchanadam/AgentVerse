import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwtPlugin from "@fastify/jwt";
import type { HubConfig } from "../env.js";
import type { Db } from "../db/index.js";
import { NonceStore } from "./nonce-store.js";
import { healthRoute } from "./routes/health.js";
import { agentsRoute } from "./routes/agents.js";
import { pairingsRoute } from "./routes/pairings.js";
import { assetsRoute } from "./routes/assets.js";
import { authRoutes } from "./routes/auth.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { wsPlugin } from "./ws/ws-plugin.js";

export function buildApp(config: HubConfig, db: Db, opts?: { logger?: boolean }): FastifyInstance {
  const app = Fastify({ logger: opts?.logger ?? false });

  const nonceStore = new NonceStore();

  // decorate() is synchronous — properties visible to all plugins when queue flushes
  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("nonceStore", nonceStore);

  app.addHook("onClose", () => {
    nonceStore.destroy();
  });

  void app.register(cors, { origin: config.CORS_ORIGIN });
  void app.register(sensible);
  void app.register(jwtPlugin, { secret: config.JWT_SECRET });
  void app.register(rateLimitPlugin, { config });
  void app.register(authRoutes);
  void app.register(authPlugin);
  void app.register(wsPlugin);
  void app.register(assetsRoute);
  void app.register(healthRoute);
  void app.register(agentsRoute);
  void app.register(pairingsRoute);

  return app;
}

// TypeScript augmentation so app.config / app.db resolve correctly
declare module "fastify" {
  interface FastifyInstance {
    config: HubConfig;
    db: Db;
    nonceStore: NonceStore;
  }
}

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwtPlugin from "@fastify/jwt";
import type { HubConfig } from "../env.js";
import type { Db } from "../db/index.js";
import { healthRoute } from "./routes/health.js";
import { agentsRoute } from "./routes/agents.js";
import { pairingsRoute } from "./routes/pairings.js";
import { assetsRoute } from "./routes/assets.js";
import { authTokenRoute } from "./routes/auth.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { wsPlugin } from "./ws/ws-plugin.js";

export function buildApp(config: HubConfig, db: Db): FastifyInstance {
  const app = Fastify({ logger: false });

  // decorate() is synchronous — properties visible to all plugins when queue flushes
  app.decorate("config", config);
  app.decorate("db", db);

  void app.register(cors, { origin: config.CORS_ORIGIN });
  void app.register(sensible);
  void app.register(jwtPlugin, { secret: config.JWT_SECRET });
  void app.register(rateLimitPlugin, { config });
  void app.register(authTokenRoute);
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
  }
}

// @agentverse/hub — Fastify REST API + WebSocket + DB (pure server)

// DB layer exports
export * from "./db/schema.js";
export { createDb, createDbFromUrl, type Db } from "./db/index.js";
export { AgentRepository, type AgentUpsertData } from "./db/repositories/agent.repository.js";
export { PairingRepository, PairingTransitionError } from "./db/repositories/pairing.repository.js";
export { EventRepository, type EventInsertData } from "./db/repositories/event.repository.js";
export {
  OfflineMessageRepository,
  type OfflineMessageInsertData,
} from "./db/repositories/offline-message.repository.js";

// Server layer exports
export { buildApp } from "./server/app.js";
export { parseEnv, type HubConfig } from "./env.js";

// WebSocket layer exports
export { ConnectionManager } from "./server/ws/connection-manager.js";
export { wsPlugin } from "./server/ws/ws-plugin.js";

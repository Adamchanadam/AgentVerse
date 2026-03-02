import type { FastifyInstance } from "fastify";

interface HealthReply {
  status: "ok";
  connectedClients: number;
  eventsPerMinute: number;
  errorRate: number;
}

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthReply }>("/api/health", async () => ({
    status: "ok",
    connectedClients: app.connections?.size ?? 0,
    eventsPerMinute: 0, // placeholder
    errorRate: 0, // placeholder
  }));
}

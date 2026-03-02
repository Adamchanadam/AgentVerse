/**
 * WebSocket plugin orchestrator — manages the full WS connection lifecycle.
 *
 * Registers @fastify/websocket, creates the GET /ws route, and wires together
 * auth-handler, event-handler, msg-relay-handler, catchup-service, and
 * connection-manager.
 *
 * Connection lifecycle:
 * 1. Send challenge nonce
 * 2. Verify auth response (Ed25519 signature over nonce bytes)
 * 3. Look up / auto-register agent, add to ConnectionManager
 * 4. Optional catchup replay
 * 5. Ping/pong heartbeat
 * 6. Authenticated message dispatch
 *
 * Spec: tasks.md Task 7 sub-task 7 (ws-plugin orchestrator)
 */

import fp from "fastify-plugin";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { EventEnvelope, EventType, EventPayload, WsFrame } from "@agentverse/shared";
import { SlidingWindowLimiter } from "./rate-limiter.js";
import { ConnectionManager } from "./connection-manager.js";
import { generateNonce, verifyAuth } from "./auth-handler.js";
import { handleSubmitEvent } from "./event-handler.js";
import { handleMsgRelay } from "./msg-relay-handler.js";
import { getCatchupEvents } from "./catchup-service.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import type { Event } from "../../db/schema.js";

// ─── Constants ────────────────────────────────────────────────
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const CATCHUP_BATCH_SIZE = 100;
const WS_OPEN = 1;

// ─── TypeScript augmentation ──────────────────────────────────
declare module "fastify" {
  interface FastifyInstance {
    connections: ConnectionManager;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function sendFrame(socket: WebSocket, frame: WsFrame): void {
  if (socket.readyState === WS_OPEN) {
    socket.send(JSON.stringify(frame));
  }
}

function reconstructEnvelope(event: Event): EventEnvelope {
  return {
    event_id: event.eventId,
    event_type: event.eventType as EventType,
    ts: event.ts.toISOString(),
    sender_pubkey: event.senderPubkey,
    recipient_ids: event.recipientIds ?? [],
    nonce: event.nonce,
    sig: event.sig,
    payload: event.payload as unknown as EventPayload,
  };
}

// ─── Plugin implementation ────────────────────────────────────

async function wsPluginImpl(app: FastifyInstance): Promise<void> {
  const connections = new ConnectionManager();
  app.decorate("connections", connections);

  // Per-operation rate limiters (per Fastify instance for test isolation)
  const agentCardLimiter = new SlidingWindowLimiter(10, 60_000); // 10/min
  const pairingLimiter = new SlidingWindowLimiter(30, 3_600_000); // 30/hr

  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket: WebSocket, _request) => {
    // ─── Per-connection state ───────────────────────────
    const nonce = generateNonce();
    let authenticated = false;
    let clientPubkey = "";
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;

    // Repositories (created from app-level db)
    const agentRepo = new AgentRepository(app.db);
    const eventRepo = new EventRepository(app.db);
    const pairingRepo = new PairingRepository(app.db);
    const offlineMsgRepo = new OfflineMessageRepository(app.db);

    // 1. Send challenge
    sendFrame(socket, { type: "challenge", nonce });

    // ─── Heartbeat helpers ──────────────────────────────
    function startHeartbeat(): void {
      pingTimer = setInterval(() => {
        sendFrame(socket, { type: "ping" });
        pongTimer = setTimeout(() => {
          // No pong received — close connection
          socket.close(1001, "pong timeout");
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    }

    function clearTimers(): void {
      if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (pongTimer !== null) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
    }

    // ─── Message handler ────────────────────────────────
    socket.on("message", (data: Buffer | string) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(data.toString()) as WsFrame;
      } catch {
        sendFrame(socket, {
          type: "error",
          code: "invalid_json",
          message: "Failed to parse frame as JSON",
        });
        return;
      }

      if (!authenticated) {
        // Only accept auth frames before authentication
        if (frame.type === "auth") {
          void handleAuth(
            frame.payload.pubkey,
            frame.payload.sig,
            frame.payload.last_seen_server_seq,
          );
        } else {
          sendFrame(socket, {
            type: "error",
            code: "not_authenticated",
            message: "Must authenticate before sending other frames",
          });
        }
        return;
      }

      // Authenticated message dispatch
      switch (frame.type) {
        case "submit_event":
          void handleSubmit(frame.payload);
          break;
        case "consumer_ack":
          // No-op on Hub in MVP (cursor tracking is Plugin-side)
          break;
        case "pong":
          // Clear pong timeout — connection is alive
          if (pongTimer !== null) {
            clearTimeout(pongTimer);
            pongTimer = null;
          }
          break;
        default:
          sendFrame(socket, {
            type: "error",
            code: "unexpected_frame",
            message: `Unexpected frame type: ${(frame as { type: string }).type}`,
          });
      }
    });

    // ─── Auth flow ──────────────────────────────────────
    async function handleAuth(
      pubkey: string,
      sig: string,
      lastSeenServerSeq?: string,
    ): Promise<void> {
      const result = verifyAuth(nonce, pubkey, sig);
      if (!result.ok) {
        sendFrame(socket, { type: "auth_error", error: result.error });
        socket.close(1002, "auth failed");
        return;
      }

      // Look up or auto-register agent
      let agent = await agentRepo.findByPubkey(pubkey);
      if (!agent) {
        agent = await agentRepo.upsert({
          id: crypto.randomUUID(),
          displayName: `Agent-${pubkey.slice(0, 8)}`,
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey,
          level: 1,
          badges: [],
        });
      }

      // Mark as authenticated
      authenticated = true;
      clientPubkey = pubkey;
      connections.add(pubkey, agent.id, socket);

      sendFrame(socket, {
        type: "auth_ok",
        payload: {
          agent_id: agent.id,
          server_time: new Date().toISOString(),
        },
      });

      // Catchup if requested
      if (lastSeenServerSeq !== undefined) {
        await runCatchup(BigInt(lastSeenServerSeq));
      }

      // Start heartbeat
      startHeartbeat();
    }

    // ─── Catchup replay ─────────────────────────────────
    async function runCatchup(fromSeq: bigint): Promise<void> {
      sendFrame(socket, {
        type: "catchup_start",
        from_seq: fromSeq.toString(),
      });

      const events = await getCatchupEvents({
        afterSeq: fromSeq,
        limit: CATCHUP_BATCH_SIZE,
        eventRepo,
        ttlDays: app.config.MSG_RELAY_TTL_DAYS,
        offlineMsgRepo,
      });

      for (const event of events) {
        sendFrame(socket, {
          type: "event",
          payload: reconstructEnvelope(event),
          server_seq: event.serverSeq.toString(),
        });
      }

      sendFrame(socket, { type: "catchup_end" });
    }

    // ─── Submit dispatch ────────────────────────────────
    async function handleSubmit(envelope: EventEnvelope): Promise<void> {
      // Per-operation rate limiting
      const client = connections.getByPubkey(clientPubkey);
      const agentId = client?.agentId ?? clientPubkey;

      if (envelope.event_type === "agent.registered" || envelope.event_type === "agent.updated") {
        if (!agentCardLimiter.tryAcquire(agentId)) {
          sendFrame(socket, {
            type: "submit_result",
            payload: {
              event_id: envelope.event_id,
              result_ts: new Date().toISOString(),
              status: "rejected",
              error: {
                code: "rate_limit_exceeded",
                message: "AgentCard rate limit exceeded (10/min)",
              },
            },
          });
          return;
        }
      }

      if (envelope.event_type.startsWith("pair.")) {
        if (!pairingLimiter.tryAcquire(agentId)) {
          sendFrame(socket, {
            type: "submit_result",
            payload: {
              event_id: envelope.event_id,
              result_ts: new Date().toISOString(),
              status: "rejected",
              error: {
                code: "rate_limit_exceeded",
                message: "Pairing rate limit exceeded (30/hr)",
              },
            },
          });
          return;
        }
      }

      let resultFrame;

      if (envelope.event_type === "msg.relay") {
        resultFrame = await handleMsgRelay(envelope, {
          eventRepo,
          agentRepo,
          pairingRepo,
          offlineMsgRepo,
          ttlDays: app.config.MSG_RELAY_TTL_DAYS,
        });
      } else {
        resultFrame = await handleSubmitEvent(envelope, {
          eventRepo,
          agentRepo,
          pairingRepo,
        });
      }

      // Send result back to sender
      sendFrame(socket, { type: "submit_result", payload: resultFrame });

      // Forward to recipient(s) if accepted
      if (resultFrame.status === "accepted") {
        for (const recipientId of envelope.recipient_ids) {
          connections.sendTo(recipientId, {
            type: "event",
            payload: envelope,
            server_seq: resultFrame.server_seq ?? "0",
          });
        }
      }
    }

    // ─── Close / error cleanup ──────────────────────────
    socket.on("close", () => {
      clearTimers();
      if (clientPubkey) {
        connections.remove(clientPubkey);
      }
    });

    socket.on("error", () => {
      clearTimers();
      if (clientPubkey) {
        connections.remove(clientPubkey);
      }
    });
  });
}

export const wsPlugin = fp(wsPluginImpl);

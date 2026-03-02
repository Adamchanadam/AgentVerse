/**
 * Tracks authenticated WebSocket clients by pubkey and agentId.
 *
 * - One connection per pubkey: re-connecting with the same pubkey closes the
 *   previous socket before registering the new one.
 * - Provides O(1) lookup by pubkey and O(n) lookup by agentId (n = number of
 *   connected clients; acceptable at MVP scale).
 */

import type { WsFrame } from "@agentverse/shared";
import { WS_READY_STATE, type WebSocketLike, type WsClient } from "./types.js";

export class ConnectionManager {
  /** pubkey -> WsClient */
  private readonly clients = new Map<string, WsClient>();

  // ─── Mutations ──────────────────────────────────────────────

  /**
   * Register an authenticated client.
   * If the same pubkey is already connected, the old socket is closed first.
   */
  add(pubkey: string, agentId: string, socket: WebSocketLike): void {
    const existing = this.clients.get(pubkey);
    if (existing) {
      existing.socket.close(4000, "replaced");
    }

    this.clients.set(pubkey, {
      socket,
      state: "authenticated",
      pubkey,
      agentId,
    });
  }

  /** Remove a client by pubkey. Returns `true` if it existed. */
  remove(pubkey: string): boolean {
    return this.clients.delete(pubkey);
  }

  // ─── Lookups ────────────────────────────────────────────────

  /** Find a client by its public key (O(1)). */
  getByPubkey(pubkey: string): WsClient | undefined {
    return this.clients.get(pubkey);
  }

  /** Find a client by agent ID (O(n) scan). */
  getByAgentId(agentId: string): WsClient | undefined {
    for (const client of this.clients.values()) {
      if (client.agentId === agentId) return client;
    }
    return undefined;
  }

  // ─── Messaging ──────────────────────────────────────────────

  /**
   * Send a JSON-encoded `WsFrame` to the agent identified by `agentId`.
   * Returns `true` if the message was sent, `false` if the agent is offline
   * or the socket is not in OPEN state.
   */
  sendTo(agentId: string, frame: WsFrame): boolean {
    const client = this.getByAgentId(agentId);
    if (!client || client.socket.readyState !== WS_READY_STATE.OPEN) {
      return false;
    }
    client.socket.send(JSON.stringify(frame));
    return true;
  }

  // ─── Stats ──────────────────────────────────────────────────

  /** Number of currently tracked connections. */
  get size(): number {
    return this.clients.size;
  }
}

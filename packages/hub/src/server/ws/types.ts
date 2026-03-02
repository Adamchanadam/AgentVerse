/**
 * WebSocket connection types for the Hub server.
 *
 * Uses a minimal `WebSocketLike` interface instead of importing from `ws`
 * directly so that tests can supply lightweight mocks without needing the
 * full `ws` / `@types/ws` dependency. The real `ws.WebSocket` satisfies
 * this interface at runtime.
 */

/** Minimal subset of `ws.WebSocket` used by the connection layer. */
export interface WebSocketLike {
  /** Send data on the socket. */
  send(data: string | Buffer, cb?: (err?: Error) => void): void;
  /** Close the connection. */
  close(code?: number, reason?: string): void;
  /** Register an event listener. */
  on(event: string, listener: (...args: unknown[]) => void): void;
  readonly readyState: number;
}

/** Standard WebSocket readyState constants. */
export const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/** Connection lifecycle states. */
export type ConnectionState = "awaiting_auth" | "authenticated";

/** A tracked WebSocket client. */
export interface WsClient {
  socket: WebSocketLike;
  state: ConnectionState;
  /** Set after successful auth. */
  pubkey?: string;
  /** Set after successful auth. */
  agentId?: string;
  /** Hex-encoded nonce sent during challenge. */
  pendingNonce?: string;
}

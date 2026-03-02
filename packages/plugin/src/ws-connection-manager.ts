/**
 * WebSocketConnectionManager — Plugin-side WebSocket connection to AgentVerse Hub.
 *
 * Handles:
 * - Challenge-response authentication (receive challenge -> sign nonce -> send auth)
 * - Automatic reconnection with exponential backoff on disconnect
 * - Sends last_seen_server_seq on reconnect for catchup
 *
 * Emits: "connected", "disconnected", "reconnecting", "frame", "error"
 *
 * Spec: tasks.md 10.2
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import type { WsFrame } from "@agentverse/shared";
import type { IdentityManager } from "./identity.js";
import { hexToBytes } from "@noble/hashes/utils";
import { calculateBackoff } from "./backoff.js";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting";

export class WebSocketConnectionManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = "disconnected";
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(
    private readonly hubUrl: string,
    private readonly identity: IdentityManager,
    private readonly getLastSeq: () => string,
  ) {
    super();
  }

  get state(): ConnectionState {
    return this._state;
  }

  connect(): void {
    if (
      this._state === "connected" ||
      this._state === "connecting" ||
      this._state === "authenticating"
    ) {
      return;
    }
    this.intentionalClose = false;
    this._state = "connecting";
    this.ws = new WebSocket(this.hubUrl);

    this.ws.on("open", () => {
      // Wait for challenge frame from server — no action needed on open
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("close", () => {
      this._state = "disconnected";
      this.emit("disconnected");
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  send(frame: WsFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(frame));
  }

  /**
   * Clean shutdown. Emits "disconnected" before removing all listeners.
   * After close(), no reconnection is attempted.
   */
  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._state = "disconnected";
    this.emit("disconnected");
    this.removeAllListeners();
  }

  private handleMessage(data: string): void {
    let frame: WsFrame;
    try {
      frame = JSON.parse(data) as WsFrame;
    } catch {
      this.emit("error", new Error("Invalid JSON from server"));
      return;
    }

    switch (frame.type) {
      case "challenge":
        this.handleChallenge(frame.nonce);
        break;
      case "auth_ok":
        this.handleAuthOk();
        break;
      case "auth_error":
        this.handleAuthError(frame.error);
        break;
      default:
        this.emit("frame", frame);
        break;
    }
  }

  private handleChallenge(nonce: string): void {
    this._state = "authenticating";
    const sig = this.identity.sign(hexToBytes(nonce));
    const authFrame: WsFrame = {
      type: "auth",
      payload: {
        pubkey: this.identity.getPublicKeyHex(),
        sig,
        last_seen_server_seq: this.getLastSeq(),
      },
    };
    this.send(authFrame);
  }

  private handleAuthOk(): void {
    this._state = "connected";
    this.attempt = 0;
    this.emit("connected");
  }

  private handleAuthError(error: string): void {
    this.emit("error", new Error(`Auth failed: ${error}`));
    // Don't reconnect on auth error — it would fail again with same credentials
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
    }
  }

  private scheduleReconnect(): void {
    this.attempt++;
    this._state = "reconnecting";
    const delay = calculateBackoff(this.attempt);
    this.emit("reconnecting", { attempt: this.attempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

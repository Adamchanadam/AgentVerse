/**
 * Browser WebSocket client for AgentVerse Hub.
 *
 * State-machine: disconnected → connecting → authenticating → connected → reconnecting
 *
 * Auth: challenge-response — server sends nonce, client signs RAW nonce bytes
 * with Ed25519 private key (NOT "agentverse:" prefix like REST bootstrap).
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { EventEnvelope, SubmitResultFrame } from "@agentverse/shared";

// ── Types ───────────────────────────────────────────────────────

export type WsClientState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting";

export interface WsClientConfig {
  url: string;
  privateKeyHex: string;
  publicKeyHex: string;
  onStateChange?: (state: WsClientState) => void;
  onEvent?: (envelope: EventEnvelope, serverSeq: string) => void;
  onSubmitResult?: (result: SubmitResultFrame) => void;
  onError?: (code: string, message: string) => void;
}

// ── WsClient ────────────────────────────────────────────────────

export class WsClient {
  private _state: WsClientState = "disconnected";
  private _ws: WebSocket | null = null;
  private _config: WsClientConfig;
  private _intentionalClose = false;
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WsClientConfig) {
    this._config = config;
  }

  get state(): WsClientState {
    return this._state;
  }

  connect(): void {
    if (this._state === "connected" || this._state === "connecting") return;
    this._intentionalClose = false;
    this._setState("connecting");
    this._open();
  }

  disconnect(): void {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._setState("disconnected");
  }

  sendEnvelope(envelope: EventEnvelope): void {
    this._send({ type: "submit_event", payload: envelope });
  }

  sendPong(): void {
    this._send({ type: "pong" });
  }

  // ── Internal ──────────────────────────────────────────────────

  private _setState(s: WsClientState): void {
    if (this._state === s) return;
    this._state = s;
    this._config.onStateChange?.(s);
  }

  private _send(data: unknown): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  private _open(): void {
    const ws = new WebSocket(this._config.url);
    this._ws = ws;

    ws.onopen = () => {
      // Server sends challenge frame; we transition to authenticating on receipt
    };

    ws.onmessage = (ev: MessageEvent) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      this._handleFrame(frame);
    };

    ws.onclose = () => {
      if (this._intentionalClose) {
        this._setState("disconnected");
        return;
      }
      this._scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror is always followed by onclose in browsers
    };
  }

  private _handleFrame(frame: Record<string, unknown>): void {
    switch (frame.type) {
      case "challenge": {
        this._setState("authenticating");
        const nonceHex = frame.nonce as string;
        const nonceBytes = hexToBytes(nonceHex);
        const sig = ed25519.sign(nonceBytes, hexToBytes(this._config.privateKeyHex));
        this._send({
          type: "auth",
          payload: {
            pubkey: this._config.publicKeyHex,
            sig: bytesToHex(sig),
          },
        });
        break;
      }

      case "auth_ok":
        this._reconnectAttempt = 0;
        this._setState("connected");
        break;

      case "auth_error":
        this._intentionalClose = true;
        this._ws?.close();
        this._ws = null;
        this._setState("disconnected");
        this._config.onError?.("auth_error", (frame.error as string) ?? "Authentication failed");
        break;

      case "event": {
        const envelope = frame.payload as EventEnvelope;
        const serverSeq = frame.server_seq as string;
        this._config.onEvent?.(envelope, serverSeq);
        break;
      }

      case "submit_result":
        this._config.onSubmitResult?.(frame.payload as SubmitResultFrame);
        break;

      case "ping":
        this.sendPong();
        break;

      case "error":
        this._config.onError?.(frame.code as string, frame.message as string);
        break;

      default:
        // Ignore unknown frames (catchup_start, catchup_end, etc.)
        break;
    }
  }

  private _scheduleReconnect(): void {
    this._setState("reconnecting");
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempt), 30000);
    this._reconnectAttempt++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._intentionalClose) {
        this._setState("connecting");
        this._open();
      }
    }, delay);
  }
}

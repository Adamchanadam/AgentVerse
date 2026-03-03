"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import { loadKeypair } from "@/lib/crypto";
import { WsClient, type WsClientState } from "@/lib/ws-client";
import { deriveEncryptionKeypair, encryptChat, decryptChat } from "@/lib/e2e-helpers";
import type { AadParts, X25519Keypair } from "@/lib/e2e-helpers";
import { buildSignedEnvelope } from "@/lib/envelope-builder";
import { RetroButton } from "@/components/RetroButton";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import type { Pairing } from "@/lib/types";
import { ed25519KeyToX25519, signEnvelope } from "@agentverse/shared";
import type { EventEnvelope, MsgRelayPayload } from "@agentverse/shared";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import styles from "./chat.module.css";

interface ChatMessage {
  id: string;
  sender: "self" | "peer" | "system";
  text: string;
  timestamp: string;
}

export default function ChatPage() {
  const { isAuthenticated, agentId } = useAuth();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wsState, setWsState] = useState<WsClientState>("disconnected");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WsClient | null>(null);
  const encKeypairRef = useRef<X25519Keypair | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // ── Fetch active pairings ─────────────────────────────────────

  const fetchPairings = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPairings();
      const active = res.pairings.filter((p) => p.status === "active");
      setPairings(active);

      const ids = new Set<string>();
      for (const p of active) {
        const other = p.agentAId === agentId ? p.agentBId : p.agentAId;
        ids.add(other);
      }
      const entries = await Promise.all(
        [...ids].map(async (id) => {
          try {
            const a = await api.getAgent(id);
            return [id, a.displayName] as const;
          } catch {
            return [id, id.slice(0, 8)] as const;
          }
        }),
      );
      setNameMap(new Map(entries));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load pairings");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, agentId]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  // ── Auto-scroll on new messages ────────────────────────────────

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Derive encryption keypair once ─────────────────────────────

  useEffect(() => {
    const kp = loadKeypair();
    if (kp) {
      encKeypairRef.current = deriveEncryptionKeypair(kp.privateKey);
    }
  }, []);

  // ── Connect WS on pairing select ──────────────────────────────

  const connectToPairing = useCallback(
    (pairId: string) => {
      // Disconnect previous
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }

      setSelectedPairId(pairId);
      setMessages([]);

      const kp = loadKeypair();
      if (!kp) {
        setError("No keypair found. Please log in first.");
        return;
      }

      const wsUrl =
        process.env.NEXT_PUBLIC_HUB_WS_URL ??
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:3000/ws`;

      const pairing = pairings.find((p) => p.id === pairId);
      const peerId = pairing
        ? pairing.agentAId === agentId
          ? pairing.agentBId
          : pairing.agentAId
        : null;
      const peerName = peerId ? (nameMap.get(peerId) ?? peerId.slice(0, 8)) : "peer";

      const client = new WsClient({
        url: wsUrl,
        privateKeyHex: kp.privateKey,
        publicKeyHex: kp.publicKey,
        onStateChange: (state) => {
          setWsState(state);
          if (state === "connected") {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                sender: "system",
                text: `Connected to ${peerName}`,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
        },
        onEvent: (envelope: EventEnvelope, _serverSeq: string) => {
          if (envelope.event_type !== "msg.relay") return;
          const payload = envelope.payload as unknown as MsgRelayPayload;
          if (payload.pair_id !== pairId) return;

          // Decrypt
          if (!encKeypairRef.current) return;
          try {
            const aad: AadParts = {
              event_id: envelope.event_id,
              pair_id: pairId,
              sender_pubkey: envelope.sender_pubkey,
            };
            const plaintext = decryptChat(
              payload.ciphertext,
              payload.ephemeral_pubkey,
              encKeypairRef.current.privateKey,
              aad,
            );
            setMessages((prev) => [
              ...prev,
              {
                id: envelope.event_id,
                sender: "peer",
                text: plaintext,
                timestamp: envelope.ts,
              },
            ]);
          } catch {
            setMessages((prev) => [
              ...prev,
              {
                id: envelope.event_id,
                sender: "system",
                text: "[decryption failed]",
                timestamp: envelope.ts,
              },
            ]);
          }
        },
        onError: (code, message) => {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "system",
              text: `Error: ${code} — ${message}`,
              timestamp: new Date().toISOString(),
            },
          ]);
        },
      });

      wsRef.current = client;
      client.connect();
    },
    [agentId, pairings, nameMap],
  );

  // ── Cleanup WS on unmount ──────────────────────────────────────

  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
    };
  }, []);

  // ── Send message ───────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !selectedPairId || !wsRef.current || wsState !== "connected") return;

    const kp = loadKeypair();
    if (!kp || !encKeypairRef.current) return;

    const pairing = pairings.find((p) => p.id === selectedPairId);
    if (!pairing) return;

    const peerId = pairing.agentAId === agentId ? pairing.agentBId : pairing.agentAId;

    // Fetch peer's Ed25519 pubkey → convert to X25519 → encrypt → send
    void (async () => {
      try {
        const agent = await api.getAgent(peerId);
        const peerX25519Pub = ed25519KeyToX25519(hexToBytes(agent.pubkey), "public");
        const peerX25519PubHex = bytesToHex(peerX25519Pub);

        const eventId = crypto.randomUUID();
        const aad: AadParts = {
          event_id: eventId,
          pair_id: selectedPairId,
          sender_pubkey: kp.publicKey,
        };

        const encrypted = encryptChat(text, peerX25519PubHex, aad);

        const envelope = buildSignedEnvelope(
          kp.privateKey,
          kp.publicKey,
          "msg.relay",
          {
            pair_id: selectedPairId,
            ciphertext: encrypted.ciphertext,
            ephemeral_pubkey: encrypted.ephemeral_pubkey,
          },
          [peerId],
        );
        // Override event_id to match AAD
        envelope.event_id = eventId;
        // Re-sign with correct event_id
        envelope.sig = signEnvelope(envelope, kp.privateKey);

        wsRef.current?.sendEnvelope(envelope);

        setMessages((prev) => [
          ...prev,
          {
            id: eventId,
            sender: "self",
            text,
            timestamp: new Date().toISOString(),
          },
        ]);
        setInput("");
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: "system",
            text: "[send failed]",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    })();
  }, [input, selectedPairId, wsState, pairings, agentId]);

  // ── Render ─────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay message="Please log in to use chat." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <AsciiSpinner />
      </div>
    );
  }

  const counterpartName = (p: Pairing) => {
    const other = p.agentAId === agentId ? p.agentBId : p.agentAId;
    return nameMap.get(other) ?? other.slice(0, 8);
  };

  return (
    <div className={styles.container}>
      {/* ── Sidebar: active pairings ── */}
      <div className={styles.sidebar} role="listbox" aria-label="Active pairings">
        <div className={styles.sidebarTitle}>ACTIVE PAIRINGS</div>
        {pairings.length === 0 ? (
          <div className={styles.emptyPairings}>No active pairings</div>
        ) : (
          pairings.map((p) => (
            <div
              key={p.id}
              role="option"
              aria-selected={p.id === selectedPairId}
              tabIndex={0}
              className={`${styles.pairingItem} ${p.id === selectedPairId ? styles.pairingItemSelected : ""}`}
              onClick={() => connectToPairing(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  connectToPairing(p.id);
                }
              }}
            >
              {counterpartName(p)}
            </div>
          ))
        )}
      </div>

      {/* ── Chat area ── */}
      {!selectedPairId ? (
        <div className={styles.noPairing}>Select a pairing to start chatting</div>
      ) : (
        <div className={styles.chatArea}>
          {/* Status bar */}
          <div className={styles.statusBar}>
            {wsState === "connected" && <span className={styles.secureBadge}>[SECURE]</span>}
            <span className={wsState === "connected" ? styles.statusConnected : styles.statusText}>
              {wsState === "connected"
                ? "Connected"
                : wsState === "connecting" || wsState === "authenticating"
                  ? "Connecting..."
                  : wsState === "reconnecting"
                    ? "Reconnecting..."
                    : "Disconnected"}
            </span>
          </div>

          {/* Message log */}
          <div className={styles.messageLog} role="log" aria-live="polite">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.sender === "self"
                    ? styles.selfMsg
                    : m.sender === "peer"
                      ? styles.peerMsg
                      : styles.systemMsg
                }
              >
                {m.sender === "system"
                  ? `--- ${m.text} ---`
                  : `> ${m.sender === "self" ? "you" : counterpartName(pairings.find((p) => p.id === selectedPairId)!)}: ${m.text}`}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Input bar */}
          <div className={styles.inputBar}>
            <input
              className={styles.input}
              type="text"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={wsState !== "connected"}
              aria-label="Chat message input"
            />
            <RetroButton
              label="SEND"
              onClick={sendMessage}
              disabled={wsState !== "connected" || !input.trim()}
            />
          </div>
        </div>
      )}

      {error && (
        <div style={{ position: "absolute", bottom: 60, left: 300 }}>
          <ErrorDisplay message={error} />
        </div>
      )}
    </div>
  );
}

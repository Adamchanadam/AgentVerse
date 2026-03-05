"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { loadKeypair } from "@/lib/crypto";
import { WsClient, type WsClientState } from "@/lib/ws-client";
import { deriveEncryptionKeypair, encryptChat, decryptChat } from "@/lib/e2e-helpers";
import type { AadParts, X25519Keypair } from "@/lib/e2e-helpers";
import { buildSignedEnvelope } from "@/lib/envelope-builder";
import { MatchStateMachine, type MatchState, type MatchCallbacks } from "@/lib/match-state-machine";
import { VerdictCoordinator } from "@/lib/verdict-coordinator";
import { parseBrawlMessage, serializeBrawlMessage } from "@/lib/brawl-message";
import type { BrawlMessage } from "@/lib/brawl-message";
import { computeDanger } from "@/lib/danger-heuristic";
import {
  MinimaxProvider,
  getMinimaxApiKey,
  setMinimaxApiKey,
  buildCoachPrompt,
} from "@/lib/llm-provider";
import { initDigest, appendDigest } from "@agentverse/shared";
import { ed25519KeyToX25519, signEnvelope } from "@agentverse/shared";
import type {
  EventEnvelope,
  MsgRelayPayload,
  TrialRule,
  TrialsStartedPayload,
  TrialsSettledPayload,
} from "@agentverse/shared";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { RetroButton } from "@/components/RetroButton";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { DangerMeter } from "@/components/DangerMeter";
import styles from "./arena.module.css";

interface ChatEntry {
  id: string;
  sender: "self" | "peer" | "system";
  text: string;
  timestamp: string;
}

function ArenaInner() {
  const { isAuthenticated, agentId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pairId = searchParams.get("pair");
  const peerId = searchParams.get("peer");
  const action = searchParams.get("action"); // "challenge" = initiator, null = defender

  // ── Core state ──────────────────────────────────────────────────
  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [rule, setRule] = useState<TrialRule | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [timerSec, setTimerSec] = useState(30);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [dangerLevel, setDangerLevel] = useState(0);
  const [result, setResult] = useState<{
    winner: string;
    loser: string;
    xpWinner: number;
    xpLoser: number;
  } | null>(null);
  const [wsState, setWsState] = useState<WsClientState>("disconnected");
  const [coachInput, setCoachInput] = useState("");
  const [coachStatus, setCoachStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [peerName, setPeerName] = useState("peer");
  const [sending, setSending] = useState(false);

  // ── API key modal state ─────────────────────────────────────────
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  // ── Refs ─────────────────────────────────────────────────────────
  const wsRef = useRef<WsClient | null>(null);
  const machineRef = useRef<MatchStateMachine | null>(null);
  const verdictCoordRef = useRef<VerdictCoordinator | null>(null);
  const encKeypairRef = useRef<X25519Keypair | null>(null);
  const digestRef = useRef<string>("");
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationRef = useRef<Array<{ role: "self" | "peer"; text: string }>>([]);
  const peerPubkeyRef = useRef<string>("");
  const keypairRef = useRef<{ privateKey: string; publicKey: string } | null>(null);

  // Fix #2: Use ref for event handler to avoid stale closures in WS callback
  const ruleRef = useRef<TrialRule | null>(null);
  useEffect(() => {
    ruleRef.current = rule;
  }, [rule]);

  // ── Auto-scroll ─────────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Countdown timer ─────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerSec(30);
    timerIntervalRef.current = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Add system message helper ───────────────────────────────────
  const addSystemMsg = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: "system",
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  // ── Derive encryption keypair ───────────────────────────────────
  useEffect(() => {
    const kp = loadKeypair();
    if (kp) {
      encKeypairRef.current = deriveEncryptionKeypair(kp.privateKey);
      keypairRef.current = kp;
    }
  }, []);

  // ── Fetch peer name + pubkey ────────────────────────────────────
  useEffect(() => {
    if (!peerId) return;
    api
      .getAgent(peerId)
      .then((a) => {
        setPeerName(a.displayName);
        peerPubkeyRef.current = a.pubkey;
      })
      .catch(() => setPeerName(peerId.slice(0, 8)));
  }, [peerId]);

  // ── Send encrypted BrawlMessage via msg.relay ───────────────────
  const sendEncrypted = useCallback(
    (plaintext: string, kp: { privateKey: string; publicKey: string }) => {
      if (!pairId || !peerId || !wsRef.current || !encKeypairRef.current) return;
      if (!peerPubkeyRef.current) return;

      const peerX25519Pub = ed25519KeyToX25519(hexToBytes(peerPubkeyRef.current), "public");
      const peerX25519PubHex = bytesToHex(peerX25519Pub);

      const eventId = crypto.randomUUID();
      const aad: AadParts = {
        event_id: eventId,
        pair_id: pairId,
        sender_pubkey: kp.publicKey,
      };

      const encrypted = encryptChat(plaintext, peerX25519PubHex, aad);

      const envelope = buildSignedEnvelope(
        kp.privateKey,
        kp.publicKey,
        "msg.relay",
        {
          pair_id: pairId,
          ciphertext: encrypted.ciphertext,
          ephemeral_pubkey: encrypted.ephemeral_pubkey,
        },
        [peerId],
      );
      // Override event_id to match AAD
      envelope.event_id = eventId;
      envelope.sig = signEnvelope(envelope, kp.privateKey);

      wsRef.current.sendEnvelope(envelope);

      // Update digest chain
      digestRef.current = appendDigest(
        digestRef.current,
        eventId,
        kp.publicKey,
        encrypted.ciphertext,
      );
    },
    [pairId, peerId],
  );

  // ── Report assembled verdict to Hub ─────────────────────────────
  const reportVerdict = useCallback(
    (
      signed: import("@agentverse/shared").SignedVerdict,
      kp: { privateKey: string; publicKey: string },
    ) => {
      if (!pairId || !peerId) return;
      const envelope = buildSignedEnvelope(
        kp.privateKey,
        kp.publicKey,
        "trials.reported",
        {
          trial_id: signed.verdict.match_id,
          signed_verdict: signed,
        } as unknown as import("@agentverse/shared").EventPayload,
        [peerId],
      );
      wsRef.current?.sendEnvelope(envelope);
      addSystemMsg("Verdict reported. Waiting for settlement...");
    },
    [pairId, peerId, addSystemMsg],
  );

  // ── Build verdict for a trigger event and send/report ───────────
  const buildAndSendVerdict = useCallback(
    (triggerEventId: string, loserId: string, kp: { privateKey: string; publicKey: string }) => {
      const machine = machineRef.current;
      const vc = verdictCoordRef.current;
      if (!machine || !vc || !agentId || !peerId || !machine.trialId || !machine.rule) return;

      const winnerId = loserId === agentId ? peerId : agentId;

      const { verdict, sig } = vc.buildAndSign({
        matchId: machine.trialId,
        winnerId,
        loserId,
        ruleId: machine.rule.id,
        triggerEventId,
        transcriptDigest: digestRef.current,
      });

      // Send verdict_sig to peer via msg.relay
      const brawlMsg: BrawlMessage = { type: "verdict_sig", verdict, sig };
      sendEncrypted(serializeBrawlMessage(brawlMsg), kp);

      machine.onVerdictSent();

      // Check if both sigs are present (peer may have already sent theirs)
      const assembled = vc.getSignedVerdict();
      if (assembled) {
        reportVerdict(assembled, kp);
      }
    },
    [agentId, peerId, sendEncrypted, reportVerdict],
  );

  // ── Initialize match state machine ──────────────────────────────
  useEffect(() => {
    if (!agentId || !peerId || !pairId) return;

    const callbacks: MatchCallbacks = {
      onStateChange: (state) => {
        setMatchState(state);
      },
      // Fix #4: Timeout-forfeit builds verdict
      onTurnTimeout: (forfeitId) => {
        addSystemMsg(`Timeout! ${forfeitId === agentId ? "You" : "Peer"} forfeit.`);
        // Build verdict: forfeit agent is the loser
        const kp = keypairRef.current;
        if (kp) {
          buildAndSendVerdict("timeout", forfeitId, kp);
        }
      },
      onRuleTriggered: (_result, _eventId) => {
        addSystemMsg("Rule triggered! Preparing verdict...");
      },
      onMatchResult: (winnerId, _loserId, _reason) => {
        addSystemMsg(winnerId === agentId ? ">>> VICTORY <<<" : ">>> DEFEAT <<<");
      },
    };

    const machine = new MatchStateMachine(
      {
        turnTimerMs: 30_000,
        myAgentId: agentId,
        peerAgentId: peerId,
        pairId,
      },
      callbacks,
    );

    machineRef.current = machine;
    return () => {
      machine.dispose();
    };
  }, [agentId, peerId, pairId, addSystemMsg, buildAndSendVerdict]);

  // ── Handle incoming WS events (via ref to avoid stale closure) ──
  const handleIncomingEventRef = useRef<
    ((envelope: EventEnvelope, kp: { privateKey: string; publicKey: string }) => void) | null
  >(null);

  handleIncomingEventRef.current = useCallback(
    (envelope: EventEnvelope, kp: { privateKey: string; publicKey: string }) => {
      if (envelope.event_type === "trials.started") {
        const payload = envelope.payload as unknown as TrialsStartedPayload;
        const machine = machineRef.current;
        if (machine) {
          machine.onTrialsStarted(payload.trial_id, payload.rule_payload, agentId ?? "");
          setRule(payload.rule_payload);
          ruleRef.current = payload.rule_payload;
          setIsMyTurn(machine.isMyTurn);
          digestRef.current = initDigest(payload.trial_id);
          addSystemMsg(
            `Match started! Rule: ${payload.rule_payload.display_hint} | ${machine.isMyTurn ? "Your turn" : "Peer's turn"}`,
          );
          startCountdown();

          // Fix #3: Init verdict coordinator — use peerPubkeyRef which is already loaded
          if (agentId && peerPubkeyRef.current) {
            verdictCoordRef.current = new VerdictCoordinator({
              myPrivKeyHex: kp.privateKey,
              myPubKeyHex: kp.publicKey,
              peerPubKeyHex: peerPubkeyRef.current,
              myAgentId: agentId,
            });
          } else {
            addSystemMsg("[warn] Peer pubkey not loaded yet — verdict may fail");
          }
        }
        return;
      }

      if (envelope.event_type === "trials.settled") {
        const payload = envelope.payload as unknown as TrialsSettledPayload;
        machineRef.current?.onTrialsSettled(payload);
        setResult({
          winner: payload.winner_agent_id,
          loser: payload.loser_agent_id,
          xpWinner: payload.xp_winner,
          xpLoser: payload.xp_loser,
        });
        return;
      }

      if (envelope.event_type === "msg.relay") {
        const relayPayload = envelope.payload as unknown as MsgRelayPayload;
        if (relayPayload.pair_id !== pairId) return;
        if (!encKeypairRef.current) return;

        // Update digest chain with ciphertext (Hub-visible field)
        digestRef.current = appendDigest(
          digestRef.current,
          envelope.event_id,
          envelope.sender_pubkey,
          relayPayload.ciphertext,
        );

        try {
          const aad: AadParts = {
            event_id: envelope.event_id,
            pair_id: pairId!,
            sender_pubkey: envelope.sender_pubkey,
          };
          const plaintext = decryptChat(
            relayPayload.ciphertext,
            relayPayload.ephemeral_pubkey,
            encKeypairRef.current.privateKey,
            aad,
          );

          // Parse BrawlMessage
          const brawlMsg = parseBrawlMessage(plaintext);
          if (!brawlMsg) return;

          if (brawlMsg.type === "chat") {
            setMessages((prev) => [
              ...prev,
              {
                id: envelope.event_id,
                sender: "peer",
                text: brawlMsg.text,
                timestamp: envelope.ts,
              },
            ]);
            conversationRef.current.push({ role: "peer", text: brawlMsg.text });

            // Evaluate rule (Fix #2: use ruleRef instead of stale `rule`)
            const currentRule = ruleRef.current;
            const machine = machineRef.current;
            if (machine) {
              const evalResult = machine.onMessageReceived(brawlMsg.text, envelope.event_id);
              setTurnCount(machine.turnCount);
              setIsMyTurn(machine.isMyTurn);
              startCountdown();

              if (evalResult?.triggered && currentRule) {
                setDangerLevel(1);
                // The peer who sent the triggering message is the loser
                const loserId = peerId!;
                buildAndSendVerdict(envelope.event_id, loserId, kp);
              } else if (currentRule) {
                setDangerLevel(computeDanger(brawlMsg.text, currentRule));
              }
            }
          } else if (brawlMsg.type === "verdict_sig") {
            // Fix #1: Receive peer's verdict signature — and counter-sign if needed
            const vc = verdictCoordRef.current;
            if (vc) {
              try {
                const assembled = vc.receivePeerSig(brawlMsg.verdict, brawlMsg.sig);
                if (assembled) {
                  // Both sigs present — report to Hub
                  reportVerdict(assembled, kp);
                } else if (!vc.isComplete) {
                  // Peer sent sig first but we haven't signed yet.
                  // If machine is in judging state, we need to counter-sign.
                  const machine = machineRef.current;
                  if (machine && machine.state === "judging") {
                    // Use the verdict from the peer's message to build our own sig
                    const { verdict, sig } = vc.buildAndSign({
                      matchId: brawlMsg.verdict.match_id,
                      winnerId: brawlMsg.verdict.winner_agent_id,
                      loserId: brawlMsg.verdict.loser_agent_id,
                      ruleId: brawlMsg.verdict.rule_id,
                      triggerEventId: brawlMsg.verdict.trigger_event_id,
                      transcriptDigest: brawlMsg.verdict.transcript_digest,
                    });
                    // Send our counter-sig
                    const counterMsg: BrawlMessage = { type: "verdict_sig", verdict, sig };
                    sendEncrypted(serializeBrawlMessage(counterMsg), kp);
                    machine.onVerdictSent();
                    // Now assemble
                    const final = vc.getSignedVerdict();
                    if (final) {
                      reportVerdict(final, kp);
                    }
                  }
                }
              } catch {
                addSystemMsg("[verdict sig mismatch]");
              }
            }
          }
        } catch {
          addSystemMsg("[decryption failed]");
        }
      }
    },
    [
      agentId,
      pairId,
      peerId,
      startCountdown,
      addSystemMsg,
      buildAndSendVerdict,
      sendEncrypted,
      reportVerdict,
    ],
  );

  // ── Connect WS + auto-challenge ─────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !agentId || !pairId || !peerId) return;

    const kp = loadKeypair();
    if (!kp) {
      setError("No keypair found. Please log in first.");
      return;
    }
    keypairRef.current = kp;

    const wsUrl =
      process.env.NEXT_PUBLIC_HUB_WS_URL ??
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:3000/ws`;

    const client = new WsClient({
      url: wsUrl,
      privateKeyHex: kp.privateKey,
      publicKeyHex: kp.publicKey,
      onStateChange: (state) => {
        setWsState(state);
        if (state === "connected") {
          // Only the challenger (action=challenge) creates the trial
          if (action === "challenge") {
            addSystemMsg("Connected. Sending challenge...");
            const machine = machineRef.current;
            if (machine && machine.state === "idle") {
              machine.challenge();
              // Generate seed as hex (no dashes) — selectRule requires hexToBytes
              const seed = crypto.randomUUID().replace(/-/g, "");
              const envelope = buildSignedEnvelope(
                kp.privateKey,
                kp.publicKey,
                "trials.created",
                {
                  pair_id: pairId,
                  rule_id: "auto",
                  seed,
                } as unknown as import("@agentverse/shared").EventPayload,
                [peerId],
              );
              client.sendEnvelope(envelope);
              addSystemMsg("Challenge sent. Waiting for match to start...");
            }
          } else {
            addSystemMsg("Connected. Waiting for match to start...");
          }
        }
      },
      // Fix #2: Use ref-based handler so WS always calls latest version
      onEvent: (envelope: EventEnvelope, _serverSeq: string) => {
        handleIncomingEventRef.current?.(envelope, kp);
      },
      onSubmitResult: (submitResult) => {
        if (submitResult.status === "rejected") {
          addSystemMsg(`Event rejected: ${submitResult.error ?? "unknown"}`);
        }
      },
      onError: (_code, message) => {
        addSystemMsg(`WS Error: ${message}`);
      },
    });

    wsRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [isAuthenticated, agentId, pairId, peerId, action, addSystemMsg]);

  // ── Coach: SEND STRATEGY handler ────────────────────────────────
  const handleSendStrategy = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine || machine.state !== "in_progress" || !machine.isMyTurn) return;
    if (!coachInput.trim()) return;
    if (sending) return;

    const apiKey = getMinimaxApiKey();
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }

    const kp = loadKeypair();
    if (!kp) return;

    setSending(true);
    setCoachStatus("Generating response...");

    try {
      const provider = new MinimaxProvider(apiKey);
      const prompt = buildCoachPrompt(
        coachInput.trim(),
        conversationRef.current,
        rule?.display_hint ?? "",
      );
      const response = await provider.generate(prompt);

      // Wrap as BrawlMessage chat
      const brawlMsg: BrawlMessage = { type: "chat", text: response };
      sendEncrypted(serializeBrawlMessage(brawlMsg), kp);

      // Add to local messages
      const eventId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: eventId,
          sender: "self",
          text: response,
          timestamp: new Date().toISOString(),
        },
      ]);
      conversationRef.current.push({ role: "self", text: response });

      // Update state machine
      machine.onMessageSent();
      setTurnCount(machine.turnCount);
      setIsMyTurn(machine.isMyTurn);
      startCountdown();

      // Update danger meter for own message
      if (rule) {
        setDangerLevel(computeDanger(response, rule));
      }

      setCoachStatus("Sent!");
    } catch (e) {
      setCoachStatus(e instanceof Error ? e.message : "LLM call failed");
    } finally {
      setSending(false);
    }
  }, [coachInput, rule, sending, sendEncrypted, startCountdown]);

  // ── API key modal submit ────────────────────────────────────────
  const handleApiKeySubmit = useCallback(() => {
    if (!apiKeyInput.trim()) return;
    setMinimaxApiKey(apiKeyInput.trim());
    setShowApiKeyModal(false);
    setApiKeyInput("");
    // Retry the strategy send
    handleSendStrategy();
  }, [apiKeyInput, handleSendStrategy]);

  // ── REMATCH handler ─────────────────────────────────────────────
  const handleRematch = useCallback(() => {
    // Reset local state and reload page to re-initiate
    setResult(null);
    setMatchState("idle");
    setRule(null);
    ruleRef.current = null;
    setMessages([]);
    setTurnCount(0);
    setDangerLevel(0);
    setCoachInput("");
    setCoachStatus("");
    conversationRef.current = [];
    digestRef.current = "";
    verdictCoordRef.current = null;
    // Reconnect will auto-challenge
    wsRef.current?.disconnect();
    setTimeout(() => {
      wsRef.current?.connect();
    }, 500);
  }, []);

  // ── Cleanup interval on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // ── Render guards ───────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay message="Please log in to use the Arena." />
      </div>
    );
  }

  if (!pairId || !peerId) {
    return (
      <div className={styles.center}>
        <ErrorDisplay message="Missing pair or peer. Go to AgentDex to start a challenge." />
      </div>
    );
  }

  const isIdle = matchState === "idle" || matchState === "challenge_sent";
  const isActive = matchState === "in_progress";
  const isFinished = matchState === "settled";

  return (
    <div className={styles.container}>
      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <span className={styles.statusRound}>Round {turnCount}</span>
        <span className={styles.statusTimer}>{isActive ? `${timerSec}s` : "--"}</span>
        <span className={styles.statusRule}>{rule ? `Rule: ${rule.display_hint}` : "No rule"}</span>
        {wsState === "connected" && <span className={styles.secureBadge}>[SECURE]</span>}
      </div>

      {/* ── Pre-match idle state ── */}
      {isIdle ? (
        <div className={styles.idleContainer}>
          <div className={styles.idleTitle}>
            {matchState === "idle" ? "ARENA" : "WAITING FOR MATCH..."}
          </div>
          <div className={styles.idleHint}>
            {matchState === "idle"
              ? `vs ${peerName}`
              : "Challenge sent. Hub will start the match shortly."}
          </div>
          <AsciiSpinner />
        </div>
      ) : (
        <>
          {/* ── Coach Console (left) ── */}
          <div className={styles.coachPanel}>
            <div className={styles.coachTitle}>COACH CONSOLE</div>
            <div className={styles.coachArea}>
              <textarea
                className={styles.coachTextarea}
                placeholder="Enter tactical instruction for your agent..."
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                disabled={!isActive || !isMyTurn || sending}
                aria-label="Coach instruction input"
              />
              <RetroButton
                label={sending ? "THINKING..." : "SEND STRATEGY"}
                onClick={handleSendStrategy}
                disabled={!isActive || !isMyTurn || !coachInput.trim() || sending}
              />
              {coachStatus && <div className={styles.coachStatus}>{coachStatus}</div>}
              <div className={styles.coachStatus}>
                {isActive ? (isMyTurn ? "YOUR TURN" : "PEER'S TURN") : matchState.toUpperCase()}
              </div>
            </div>
          </div>

          {/* ── Chat area (center) ── */}
          <div className={styles.chatArea}>
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
                    : `> ${m.sender === "self" ? "you" : peerName}: ${m.text}`}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* ── Danger meter (right) ── */}
          <div className={styles.dangerPanel}>
            <DangerMeter level={dangerLevel} />
          </div>
        </>
      )}

      {/* ── Result overlay (Fix #5: REMATCH + AGENTDEX) ── */}
      {isFinished && result && (
        <div className={styles.resultOverlay}>
          <div className={result.winner === agentId ? styles.victory : styles.defeat}>
            {result.winner === agentId ? ">>> VICTORY <<<" : ">>> DEFEAT <<<"}
          </div>
          <div className={styles.resultXp}>
            XP: +{result.winner === agentId ? result.xpWinner : result.xpLoser}
          </div>
          <div className={styles.resultButtons}>
            <RetroButton label="REMATCH" onClick={handleRematch} />
            <RetroButton
              label="AGENTDEX"
              variant="ghost"
              onClick={() => router.push("/agentdex")}
            />
          </div>
        </div>
      )}

      {/* ── API Key Modal ── */}
      {showApiKeyModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>MINIMAX API KEY</div>
            <div className={styles.modalHint}>
              Enter your MiniMax API key. It is stored locally in your browser and never sent to the
              Hub.
            </div>
            <input
              className={styles.modalInput}
              type="password"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApiKeySubmit();
                if (e.key === "Escape") setShowApiKeyModal(false);
              }}
              autoFocus
              aria-label="MiniMax API key"
            />
            <div className={styles.modalButtons}>
              <RetroButton
                label="CANCEL"
                variant="ghost"
                onClick={() => setShowApiKeyModal(false)}
              />
              <RetroButton
                label="SAVE"
                onClick={handleApiKeySubmit}
                disabled={!apiKeyInput.trim()}
              />
            </div>
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

export default function ArenaPage() {
  return (
    <Suspense fallback={<div style={{ color: "var(--accent-cyan)", textAlign: "center", paddingTop: "40vh" }}>Loading Arena...</div>}>
      <ArenaInner />
    </Suspense>
  );
}

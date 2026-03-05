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
  const [timerSec, setTimerSec] = useState(90);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [dangerLevel, setDangerLevel] = useState(0);
  const [result, setResult] = useState<{
    winner: string;
    loser: string;
    xpWinner: number;
    xpLoser: number;
  } | null>(null);
  const [, setWsState] = useState<WsClientState>("disconnected");
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
    setTimerSec(90);
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

  // ── Ref-based helpers (avoid useCallback dep chains → render loops) ──

  const sendEncryptedRef = useRef<
    (plaintext: string, kp: { privateKey: string; publicKey: string }) => void
  >(() => {});
  const reportVerdictRef = useRef<
    (
      signed: import("@agentverse/shared").SignedVerdict,
      kp: { privateKey: string; publicKey: string },
    ) => void
  >(() => {});
  const buildAndSendVerdictRef = useRef<
    (triggerEventId: string, loserId: string, kp: { privateKey: string; publicKey: string }) => void
  >(() => {});

  // Keep refs updated with latest closures (no dependency arrays needed)
  sendEncryptedRef.current = (plaintext, kp) => {
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
    envelope.event_id = eventId;
    envelope.sig = signEnvelope(envelope, kp.privateKey);

    wsRef.current.sendEnvelope(envelope);

    digestRef.current = appendDigest(
      digestRef.current,
      eventId,
      kp.publicKey,
      encrypted.ciphertext,
    );
  };

  reportVerdictRef.current = (signed, kp) => {
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
  };

  buildAndSendVerdictRef.current = (triggerEventId, loserId, kp) => {
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

    const brawlMsg: BrawlMessage = { type: "verdict_sig", verdict, sig };
    sendEncryptedRef.current(serializeBrawlMessage(brawlMsg), kp);

    machine.onVerdictSent();

    const assembled = vc.getSignedVerdict();
    if (assembled) {
      reportVerdictRef.current(assembled, kp);
    }
  };

  // ── Initialize match state machine ──────────────────────────────
  useEffect(() => {
    if (!agentId || !peerId || !pairId) return;

    const callbacks: MatchCallbacks = {
      onStateChange: (state) => {
        setMatchState(state);
      },
      onTurnTimeout: (forfeitId) => {
        addSystemMsg(`Timeout! ${forfeitId === agentId ? "You" : "Peer"} forfeit.`);
        const kp = keypairRef.current;
        if (kp) {
          buildAndSendVerdictRef.current("timeout", forfeitId, kp);
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
        turnTimerMs: 90_000,
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
  }, [agentId, peerId, pairId, addSystemMsg]);

  // ── Handle incoming WS events (ref-based to avoid stale closures) ──
  const handleIncomingEventRef = useRef<
    ((envelope: EventEnvelope, kp: { privateKey: string; publicKey: string }) => void) | null
  >(null);

  handleIncomingEventRef.current = (
    envelope: EventEnvelope,
    kp: { privateKey: string; publicKey: string },
  ) => {
    if (envelope.event_type === "trials.started") {
      const payload = envelope.payload as unknown as TrialsStartedPayload;
      const machine = machineRef.current;
      if (machine) {
        machine.onTrialsStarted(
          payload.trial_id,
          payload.rule_payload,
          payload.challenger_agent_id,
        );
        setRule(payload.rule_payload);
        ruleRef.current = payload.rule_payload;
        setIsMyTurn(machine.isMyTurn);
        digestRef.current = initDigest(payload.trial_id);
        addSystemMsg(
          `Match started! Rule: ${payload.rule_payload.display_hint} | ${machine.isMyTurn ? "Your turn" : "Peer's turn"}`,
        );
        startCountdown();

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

          const currentRule = ruleRef.current;
          const machine = machineRef.current;
          if (machine) {
            const evalResult = machine.onMessageReceived(brawlMsg.text, envelope.event_id);
            setTurnCount(machine.turnCount);
            setIsMyTurn(machine.isMyTurn);
            startCountdown();

            if (evalResult?.triggered && currentRule) {
              setDangerLevel(1);
              buildAndSendVerdictRef.current(envelope.event_id, peerId!, kp);
            } else if (currentRule) {
              setDangerLevel(computeDanger(brawlMsg.text, currentRule));
            }
          }
        } else if (brawlMsg.type === "verdict_sig") {
          const vc = verdictCoordRef.current;
          if (vc) {
            try {
              const assembled = vc.receivePeerSig(brawlMsg.verdict, brawlMsg.sig);
              if (assembled) {
                reportVerdictRef.current(assembled, kp);
              } else if (!vc.isComplete) {
                const machine = machineRef.current;
                if (machine && machine.state === "judging") {
                  const { verdict, sig } = vc.buildAndSign({
                    matchId: brawlMsg.verdict.match_id,
                    winnerId: brawlMsg.verdict.winner_agent_id,
                    loserId: brawlMsg.verdict.loser_agent_id,
                    ruleId: brawlMsg.verdict.rule_id,
                    triggerEventId: brawlMsg.verdict.trigger_event_id,
                    transcriptDigest: brawlMsg.verdict.transcript_digest,
                  });
                  const counterMsg: BrawlMessage = { type: "verdict_sig", verdict, sig };
                  sendEncryptedRef.current(serializeBrawlMessage(counterMsg), kp);
                  machine.onVerdictSent();
                  const final = vc.getSignedVerdict();
                  if (final) {
                    reportVerdictRef.current(final, kp);
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
  };

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
      sendEncryptedRef.current(serializeBrawlMessage(brawlMsg), kp);

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

      setCoachInput("");
      setCoachStatus("Sent!");
    } catch (e) {
      setCoachStatus(e instanceof Error ? e.message : "LLM call failed");
    } finally {
      setSending(false);
    }
  }, [coachInput, rule, sending, startCountdown]);

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
  const isJudging = matchState === "judging" || matchState === "reporting";
  const isFinished = matchState === "settled";
  const hasApiKey = typeof window !== "undefined" && !!getMinimaxApiKey();

  // Timer urgency color
  const timerClass =
    timerSec <= 10
      ? styles.timerCritical
      : timerSec <= 30
        ? styles.timerWarning
        : styles.statusTimer;

  return (
    <div className={styles.container}>
      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <span className={styles.statusRound}>
          {isActive || isJudging || isFinished ? `Turn ${turnCount}` : "---"}
        </span>
        <span className={timerClass}>{isActive ? `${timerSec}s` : "--"}</span>
        <span className={styles.statusRule}>
          {rule ? `Forbidden: ${rule.display_hint}` : "---"}
        </span>
        {isActive && (
          <span className={isMyTurn ? styles.turnBadgeMine : styles.turnBadgePeer}>
            {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
          </span>
        )}
      </div>

      {/* ── API Key Warning Banner ── */}
      {!hasApiKey && !showApiKeyModal && (isIdle || isActive) && (
        <div className={styles.apiKeyBanner}>
          <span>{">"} LLM API KEY REQUIRED to play.</span>
          <RetroButton label="SET API KEY" onClick={() => setShowApiKeyModal(true)} />
        </div>
      )}

      {/* ── Pre-match: Briefing Screen ── */}
      {isIdle ? (
        <div className={styles.idleContainer}>
          <pre className={styles.asciiTitle}>{`
  ╔═══════════════════════════╗
  ║    P R O M P T  B R A W L ║
  ╚═══════════════════════════╝`}</pre>
          <div className={styles.vsBlock}>
            <span className={styles.vsYou}>YOU</span>
            <span className={styles.vsSeparator}>{"//VS//"}</span>
            <span className={styles.vsPeer}>{peerName.toUpperCase()}</span>
          </div>

          <div className={styles.briefing}>
            <div className={styles.briefingTitle}>{">"} HOW TO PLAY</div>
            <div className={styles.briefingText}>
              Each match has a <span className={styles.highlight}>FORBIDDEN WORD</span> (shown as a
              hint like &quot;m____&quot;).
            </div>
            <div className={styles.briefingText}>
              You are the <span className={styles.highlight}>COACH</span>. Type strategy
              instructions to guide your AI agent&apos;s conversation.
            </div>
            <div className={styles.briefingText}>
              <span className={styles.highlight}>GOAL:</span> Trick your opponent&apos;s AI into
              saying the forbidden word. Avoid saying it yourself!
            </div>
            <div className={styles.briefingText}>
              The <span className={styles.highlight}>DANGER METER</span> shows how close messages
              are to the forbidden pattern.
            </div>
          </div>

          {matchState === "challenge_sent" ? (
            <div className={styles.waitingBlock}>
              <AsciiSpinner text="CONNECTING" />
              <div className={styles.idleHint}>Challenge sent. Match starting shortly...</div>
            </div>
          ) : (
            <div className={styles.waitingBlock}>
              <AsciiSpinner text="CONNECTING" />
              <div className={styles.idleHint}>Connecting to opponent...</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Coach Console (left) ── */}
          <div className={styles.coachPanel}>
            <div className={styles.coachTitle}>{">"} COACH CONSOLE</div>
            <div className={styles.coachArea}>
              <div className={styles.coachHelp}>
                Type your strategy. Your AI will craft a response based on your instruction.
              </div>
              <textarea
                className={styles.coachTextarea}
                placeholder={
                  'Example strategies:\n• "Steer the topic toward food"\n• "Ask about their weekend plans"\n• "Agree with everything they say"'
                }
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                disabled={!isActive || !isMyTurn || sending}
                aria-label="Coach instruction input"
              />
              <RetroButton
                label={sending ? "GENERATING..." : "SEND STRATEGY"}
                onClick={handleSendStrategy}
                disabled={!isActive || !isMyTurn || !coachInput.trim() || sending}
              />
              <div className={styles.coachStatusLine}>
                {coachStatus && <span>{coachStatus}</span>}
                {isActive && !coachStatus && (
                  <span className={isMyTurn ? styles.turnTextMine : styles.turnTextPeer}>
                    {isMyTurn ? "Waiting for your strategy..." : "Opponent is thinking..."}
                  </span>
                )}
                {isJudging && <span className={styles.judgingText}>JUDGING...</span>}
              </div>
            </div>
          </div>

          {/* ── Chat area (center) ── */}
          <div className={styles.chatArea}>
            <div className={styles.messageLog} role="log" aria-live="polite">
              {messages.length === 0 && isActive && (
                <div className={styles.systemMsg}>
                  --- MATCH STARTED --- Trick your opponent into saying the forbidden word!
                </div>
              )}
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
                    : `[T${turnCount}] > ${m.sender === "self" ? "you" : peerName}: ${m.text}`}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* ── Danger meter (right) ── */}
          <div className={styles.dangerPanel}>
            <DangerMeter level={dangerLevel} />
            <div className={styles.dangerHelp}>Proximity to forbidden pattern</div>
          </div>
        </>
      )}

      {/* ── Result overlay ── */}
      {isFinished && result && (
        <div className={styles.resultOverlay}>
          <pre className={styles.resultAscii}>
            {result.winner === agentId
              ? `╔═══════════════════╗
║   V I C T O R Y   ║
╚═══════════════════╝`
              : `╔═══════════════════╗
║    D E F E A T    ║
╚═══════════════════╝`}
          </pre>
          <div className={styles.resultSummary}>
            {rule && (
              <div className={styles.resultRule}>
                Forbidden word: <span className={styles.highlight}>{rule.pattern}</span>
              </div>
            )}
            <div className={styles.resultDetail}>Rounds played: {turnCount}</div>
          </div>
          <div className={styles.resultXp}>
            XP: +{result.winner === agentId ? result.xpWinner : result.xpLoser}
          </div>
          <div className={styles.resultButtons}>
            <RetroButton label="REMATCH" onClick={handleRematch} />
            <RetroButton
              label="BACK TO AGENTDEX"
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
            <div className={styles.modalTitle}>{">"} LLM API KEY SETUP</div>
            <div className={styles.modalHint}>
              Prompt Brawl uses MiniMax M2.5 to power your AI agent. You need an API key to play.
            </div>
            <div className={styles.modalHint}>
              Get your key at <span className={styles.highlight}>api.minimax.io</span> (free tier
              available). Your key stays in your browser and is never sent to the server.
            </div>
            <input
              className={styles.modalInput}
              type="password"
              placeholder="eyJ... or sk-..."
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
                label="SAVE KEY"
                onClick={handleApiKeySubmit}
                disabled={!apiKeyInput.trim()}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorFloat}>
          <ErrorDisplay message={error} />
        </div>
      )}
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense
      fallback={
        <div style={{ color: "var(--accent-cyan)", textAlign: "center", paddingTop: "40vh" }}>
          Loading Arena...
        </div>
      }
    >
      <ArenaInner />
    </Suspense>
  );
}

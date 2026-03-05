#!/usr/bin/env node
/**
 * Sprint 1 PvP Test Bot — fully encrypted Prompt Brawl participant.
 *
 * Usage: node tools/pvp-test-bot.mjs
 *
 * This script:
 * 1. Generates a fresh Ed25519 keypair
 * 2. Bootstraps as a new agent via POST /api/auth/bootstrap
 * 3. Connects to Hub WebSocket + authenticates
 * 4. Waits for pairing request → auto-approves
 * 5. Waits for trials.started → participates in encrypted match
 * 6. Exchanges BrawlMessage chat via E2E encrypted msg.relay
 * 7. After a few turns, intentionally triggers the forbidden word
 * 8. Handles verdict signing coordination → trials.reported → settlement
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { randomBytes as nodeRandomBytes } from "crypto";
import WebSocket from "ws";

// Shared library — signing, encryption, rules, verdict
import {
  signEnvelope as sharedSignEnvelope,
  signVerdict,
  verifyVerdictSignature,
  ed25519KeyToX25519,
  encryptMessage,
  decryptMessage,
  evaluateRule,
  initDigest,
  appendDigest,
} from "@agentverse/shared";

const HUB_URL = process.env.HUB_URL || "http://localhost:3000";
const WS_URL = process.env.WS_URL || "ws://localhost:3000/ws";

// ─── Identity ────────────────────────────────────────────────

const privKey = bytesToHex(nodeRandomBytes(32));
const pubKey = bytesToHex(ed25519.getPublicKey(hexToBytes(privKey)));
console.log(`[BOT] Generated keypair — pubkey: ${pubKey.slice(0, 16)}...`);

// Derive X25519 encryption keypair from Ed25519 seed
const x25519Priv = ed25519KeyToX25519(hexToBytes(privKey), "private");
const x25519Pub = ed25519KeyToX25519(ed25519.getPublicKey(hexToBytes(privKey)), "public");
console.log(`[BOT] X25519 derived — enc pubkey: ${bytesToHex(x25519Pub).slice(0, 16)}...`);

// ─── Base64 helpers (Node) ───────────────────────────────────

function base64Encode(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function base64Decode(str) {
  return new Uint8Array(Buffer.from(str, "base64"));
}

// ─── Envelope builder (uses shared signing) ──────────────────

function buildSignedEnvelope(eventType, payload, recipientIds) {
  const envelope = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    ts: new Date().toISOString(),
    sender_pubkey: pubKey,
    recipient_ids: recipientIds,
    nonce: bytesToHex(nodeRandomBytes(16)),
    sig: "",
    payload,
  };
  envelope.sig = sharedSignEnvelope(envelope, privKey);
  return envelope;
}

// ─── Encryption helpers ──────────────────────────────────────

function encryptAndSend(ws, plaintext, peerEd25519PubHex, pairId, recipientId) {
  const peerX25519Pub = ed25519KeyToX25519(hexToBytes(peerEd25519PubHex), "public");

  const eventId = crypto.randomUUID();
  const aad = {
    event_id: eventId,
    pair_id: pairId,
    sender_pubkey: pubKey,
  };

  const encrypted = encryptMessage(plaintext, peerX25519Pub, aad);

  // Build envelope with base64 ciphertext + hex ephemeral_pubkey
  const envelope = {
    event_id: eventId,
    event_type: "msg.relay",
    ts: new Date().toISOString(),
    sender_pubkey: pubKey,
    recipient_ids: [recipientId],
    nonce: bytesToHex(nodeRandomBytes(16)),
    sig: "",
    payload: {
      pair_id: pairId,
      ciphertext: base64Encode(encrypted.ciphertext),
      ephemeral_pubkey: bytesToHex(encrypted.ephemeral_pubkey),
    },
  };
  envelope.sig = sharedSignEnvelope(envelope, privKey);

  ws.send(JSON.stringify({ type: "submit_event", payload: envelope }));

  return { eventId, ciphertextBase64: envelope.payload.ciphertext };
}

function decryptRelay(relayPayload, myX25519PrivKey, aad) {
  const ciphertext = base64Decode(relayPayload.ciphertext);
  const ephemeralPub = hexToBytes(relayPayload.ephemeral_pubkey);
  return decryptMessage(ciphertext, ephemeralPub, myX25519PrivKey, aad);
}

// ─── BrawlMessage helpers ────────────────────────────────────

function serializeBrawlMessage(msg) {
  return JSON.stringify(msg);
}

function parseBrawlMessage(json) {
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === "chat" || parsed.type === "verdict_sig") return parsed;
    return null;
  } catch {
    return null;
  }
}

// ─── HTTP helpers ────────────────────────────────────────────

async function fetchJSON(path, opts = {}) {
  const { headers: extraHeaders, ...rest } = opts;
  const res = await fetch(`${HUB_URL}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`[BOT] HTTP ${res.status} ${path}:`, JSON.stringify(json));
    throw new Error(`HTTP ${res.status}: ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

// ─── Bootstrap ───────────────────────────────────────────────

async function bootstrap() {
  const { nonce } = await fetchJSON("/api/auth/nonce");
  console.log(`[BOT] Got nonce: ${nonce.slice(0, 16)}...`);

  const message = `agentverse:${nonce}`;
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(message), hexToBytes(privKey)));

  const result = await fetchJSON("/api/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      pubkey: pubKey,
      signature: sig,
      nonce,
      display_name: "PvP-TestBot",
      persona_tags: ["test", "bot"],
    }),
  });

  console.log(`[BOT] Bootstrapped — agent_id: ${result.agent_id}, is_new: ${result.is_new}`);
  return result;
}

// ─── WebSocket ───────────────────────────────────────────────

function connectWS(jwt) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let agentId = null;
    let peerAgentId = null;
    let peerPubkey = null; // Ed25519 pubkey hex
    let currentPairId = null;
    let matchActive = false;
    let rule = null;
    let trialId = null;
    let turnCount = 0;
    let digestChain = "";

    // Verdict coordination state
    let myVerdictSig = null;
    let myVerdict = null;
    let peerVerdictSig = null;

    // Bot responses (safe first, then trigger)
    const SAFE_RESPONSES = [
      "That's a fascinating perspective. Tell me more about your reasoning.",
      "I see what you mean. Let me share my thoughts on this topic.",
      "Interesting point! I'd like to explore this further with you.",
    ];

    ws.on("open", () => {
      console.log("[BOT] WS connected, waiting for challenge...");
    });

    ws.on("message", async (data) => {
      const frame = JSON.parse(data.toString());

      // ── Auth challenge ──
      if (frame.type === "challenge") {
        const nonce = frame.nonce;
        const sig = bytesToHex(ed25519.sign(hexToBytes(nonce), hexToBytes(privKey)));
        ws.send(
          JSON.stringify({
            type: "auth",
            payload: { pubkey: pubKey, sig },
          }),
        );
        return;
      }

      if (frame.type === "auth_ok") {
        agentId = frame.payload.agent_id;
        console.log(`[BOT] Authenticated as ${agentId.slice(0, 8)}...`);
        resolve({ ws, agentId });
        return;
      }

      if (frame.type === "auth_error") {
        console.error("[BOT] Auth failed:", frame.error);
        return;
      }

      if (frame.type === "submit_result") {
        const p = frame.payload;
        console.log(
          `[BOT] submit_result: ${p.status}${p.error ? ` (${p.error.code}: ${p.error.message})` : ""}`,
        );
        return;
      }

      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      // ── Events ──
      if (frame.type === "event") {
        const evt = frame.payload;
        console.log(`[BOT] Event: ${evt.event_type}`);

        // ── Auto-approve pair requests ──
        if (evt.event_type === "pair.requested") {
          console.log("[BOT] Pair request received! Fetching pair_id...");
          await new Promise((r) => setTimeout(r, 300));
          const pairingsRes = await fetchJSON("/api/pairings", {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          const pending = pairingsRes.pairings?.find(
            (p) => p.status === "pending" && p.agentBId === agentId,
          );
          if (pending) {
            currentPairId = pending.id;
            peerAgentId = pending.agentAId;
            console.log(`[BOT] Auto-approving pairing ${currentPairId.slice(0, 8)}...`);

            // Fetch peer's pubkey for encryption
            try {
              const peerAgent = await fetchJSON(`/api/agents/${peerAgentId}`, {
                headers: { Authorization: `Bearer ${jwt}` },
              });
              peerPubkey = peerAgent.pubkey;
              console.log(`[BOT] Peer pubkey: ${peerPubkey.slice(0, 16)}...`);
            } catch (e) {
              console.error("[BOT] Failed to fetch peer pubkey:", e.message);
            }

            const approveEnv = buildSignedEnvelope(
              "pair.approved",
              {
                pair_id: currentPairId,
                requester_agent_id: pending.agentAId,
              },
              [pending.agentAId],
            );
            ws.send(JSON.stringify({ type: "submit_event", payload: approveEnv }));
          }
          return;
        }

        // ── Match started ──
        if (evt.event_type === "trials.started") {
          const payload = evt.payload;
          rule = payload.rule_payload;
          trialId = payload.trial_id;
          matchActive = true;
          turnCount = 0;
          digestChain = initDigest(trialId);
          myVerdictSig = null;
          myVerdict = null;
          peerVerdictSig = null;

          // Determine peer from challenger info
          const challengerId = payload.challenger_agent_id;
          if (!peerAgentId) {
            peerAgentId = challengerId === agentId ? null : challengerId;
          }

          console.log(`\n${"═".repeat(50)}`);
          console.log(`  MATCH STARTED!`);
          console.log(`  Trial: ${trialId.slice(0, 8)}...`);
          console.log(`  Rule: ${rule.display_hint} (${rule.id})`);
          console.log(`  Forbidden pattern: "${rule.pattern}"`);
          console.log(`  Challenger: ${challengerId === agentId ? "ME" : "PEER"}`);
          console.log(`${"═".repeat(50)}\n`);

          // If peer pubkey not yet fetched, try now
          if (!peerPubkey && peerAgentId) {
            try {
              const peerAgent = await fetchJSON(`/api/agents/${peerAgentId}`, {
                headers: { Authorization: `Bearer ${jwt}` },
              });
              peerPubkey = peerAgent.pubkey;
              console.log(`[BOT] Peer pubkey fetched: ${peerPubkey.slice(0, 16)}...`);
            } catch (e) {
              console.error("[BOT] Cannot fetch peer pubkey:", e.message);
            }
          }
          return;
        }

        // ── Incoming msg.relay ──
        if (evt.event_type === "msg.relay" && matchActive) {
          const relayPayload = evt.payload;
          if (relayPayload.pair_id !== currentPairId) return;

          // Update digest chain (ciphertext is base64-encoded)
          digestChain = appendDigest(
            digestChain,
            evt.event_id,
            evt.sender_pubkey,
            relayPayload.ciphertext,
          );

          // Decrypt
          const aad = {
            event_id: evt.event_id,
            pair_id: currentPairId,
            sender_pubkey: evt.sender_pubkey,
          };

          let plaintext;
          try {
            plaintext = decryptRelay(relayPayload, x25519Priv, aad);
          } catch (e) {
            console.error("[BOT] Decryption failed:", e.message);
            return;
          }

          const brawlMsg = parseBrawlMessage(plaintext);
          if (!brawlMsg) {
            console.error("[BOT] Failed to parse BrawlMessage:", plaintext.slice(0, 80));
            return;
          }

          // ── Handle chat message ──
          if (brawlMsg.type === "chat") {
            turnCount++;
            console.log(`[BOT] [T${turnCount}] Peer says: "${brawlMsg.text}"`);

            // Evaluate rule on peer's message
            const evalResult = evaluateRule(rule, brawlMsg.text);
            if (evalResult.triggered) {
              console.log(`[BOT] ⚡ PEER TRIGGERED THE RULE! Building verdict...`);
              // Peer is the loser (they said the forbidden word)
              buildAndSendVerdict(ws, evt.event_id, peerAgentId, agentId);
              return;
            }

            // Wait a moment, then respond
            await new Promise((r) => setTimeout(r, 1000));

            // After enough turns, intentionally trigger the rule
            let responseText;
            if (turnCount >= 3 && rule) {
              if (rule.type === "forbidden_word") {
                responseText = `You know what, I think the answer is ${rule.pattern}. Don't you agree?`;
              } else {
                responseText = "Let me ask you a question? That should work!";
              }
              console.log(`[BOT] ⚡ INTENTIONALLY TRIGGERING RULE with: "${responseText}"`);
            } else {
              responseText = SAFE_RESPONSES[turnCount % SAFE_RESPONSES.length];
            }

            console.log(`[BOT] [T${turnCount}] Responding: "${responseText}"`);

            if (!peerPubkey) {
              console.error("[BOT] Cannot send — no peer pubkey!");
              return;
            }

            const { eventId, ciphertextBase64 } = encryptAndSend(
              ws,
              serializeBrawlMessage({ type: "chat", text: responseText }),
              peerPubkey,
              currentPairId,
              peerAgentId,
            );

            // Update digest chain for my sent message
            digestChain = appendDigest(digestChain, eventId, pubKey, ciphertextBase64);
          }

          // ── Handle verdict_sig from peer ──
          else if (brawlMsg.type === "verdict_sig") {
            console.log("[BOT] Received verdict_sig from peer");
            const { verdict, sig } = brawlMsg;

            // Verify peer's signature
            if (!peerPubkey || !verifyVerdictSignature(verdict, sig, peerPubkey)) {
              console.error("[BOT] Peer verdict signature INVALID!");
              return;
            }
            console.log("[BOT] Peer verdict signature verified ✓");
            peerVerdictSig = sig;

            // Counter-sign if we haven't already
            if (!myVerdictSig) {
              myVerdict = verdict;
              myVerdictSig = signVerdict(verdict, privKey);
              console.log("[BOT] Counter-signed verdict ✓");

              // Send our verdict_sig back to peer
              const counterMsg = { type: "verdict_sig", verdict, sig: myVerdictSig };
              encryptAndSend(
                ws,
                serializeBrawlMessage(counterMsg),
                peerPubkey,
                currentPairId,
                peerAgentId,
              );
              console.log("[BOT] Sent counter verdict_sig to peer");
            }

            // Try to assemble and report
            tryAssembleAndReport(ws);
          }

          // Send consumer_ack
          if (frame.server_seq) {
            ws.send(
              JSON.stringify({
                type: "consumer_ack",
                payload: { server_seq: frame.server_seq, event_id: evt.event_id },
              }),
            );
          }
          return;
        }

        // ── Match settled ──
        if (evt.event_type === "trials.settled") {
          const payload = evt.payload;
          matchActive = false;
          const iWon = payload.winner_agent_id === agentId;
          console.log(`\n${"═".repeat(50)}`);
          console.log(`  ${iWon ? ">>> VICTORY <<<" : ">>> DEFEAT <<<"}`);
          console.log(
            `  Winner: ${payload.winner_agent_id?.slice(0, 8)}... ${iWon ? "(ME)" : "(PEER)"}`,
          );
          console.log(`  XP: winner=${payload.xp_winner}, loser=${payload.xp_loser}`);
          console.log(`${"═".repeat(50)}\n`);
          console.log("[BOT] Match complete. Waiting for next challenge...\n");
          return;
        }

        // Send consumer_ack for other events
        if (frame.server_seq) {
          ws.send(
            JSON.stringify({
              type: "consumer_ack",
              payload: { server_seq: frame.server_seq, event_id: evt.event_id },
            }),
          );
        }
      }
    });

    // ── Verdict helpers (closure over match state) ──

    function buildAndSendVerdict(ws, triggerEventId, loserId, winnerId) {
      if (!trialId || !rule) return;

      myVerdict = {
        match_id: trialId,
        winner_agent_id: winnerId,
        loser_agent_id: loserId,
        rule_id: rule.id,
        trigger_event_id: triggerEventId,
        transcript_digest: digestChain,
      };
      myVerdictSig = signVerdict(myVerdict, privKey);
      console.log("[BOT] Built + signed verdict ✓");

      // Send verdict_sig to peer
      const brawlMsg = { type: "verdict_sig", verdict: myVerdict, sig: myVerdictSig };
      encryptAndSend(ws, serializeBrawlMessage(brawlMsg), peerPubkey, currentPairId, peerAgentId);
      console.log("[BOT] Sent verdict_sig to peer");

      tryAssembleAndReport(ws);
    }

    function tryAssembleAndReport(ws) {
      if (!myVerdictSig || !peerVerdictSig || !myVerdict) return;

      const iAmWinner = myVerdict.winner_agent_id === agentId;
      const signedVerdict = {
        verdict: myVerdict,
        sig_winner: iAmWinner ? myVerdictSig : peerVerdictSig,
        sig_loser: iAmWinner ? peerVerdictSig : myVerdictSig,
      };

      console.log("[BOT] Both signatures collected — reporting trials.reported...");

      const envelope = buildSignedEnvelope(
        "trials.reported",
        {
          trial_id: trialId,
          signed_verdict: signedVerdict,
        },
        [peerAgentId],
      );
      ws.send(JSON.stringify({ type: "submit_event", payload: envelope }));
    }

    // ── WS lifecycle ──

    ws.on("error", (err) => {
      console.error("[BOT] WS error:", err.message);
    });

    ws.on("close", () => {
      console.log("[BOT] WS disconnected");
    });
  });
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  PvP Test Bot — Encrypted Prompt Brawl E2E Test");
  console.log("═══════════════════════════════════════════════════\n");

  const { jwt } = await bootstrap();
  const { ws, agentId } = await connectWS(jwt);

  console.log(`\n[BOT] Ready! Agent ID: ${agentId}`);
  console.log("[BOT] Waiting for pair request from browser Agent A...");
  console.log("[BOT] (Go to AgentDex → find PvP-TestBot → PAIR REQUEST)\n");

  // Poll for pending pairings (in case pair.requested arrives before WS)
  const pollPairings = setInterval(async () => {
    try {
      const res = await fetchJSON("/api/pairings", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const pending = res.pairings?.find((p) => p.status === "pending" && p.agentBId === agentId);
      if (pending) {
        clearInterval(pollPairings);
        console.log(
          `[BOT] Found pending pairing ${pending.id.slice(0, 8)}... — auto-approving via WS!`,
        );
        // Let the WS event handler deal with the approval
        // (it may have already been handled)
      }
    } catch {
      // Ignore poll errors
    }
  }, 3000);

  // Keep alive with proper pong responses (ping handler is in message listener)
  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // WS client responds to server pings via frame handler
    }
  }, 30000);

  process.on("SIGINT", () => {
    console.log("\n[BOT] Shutting down...");
    clearInterval(keepAlive);
    clearInterval(pollPairings);
    ws.close();
    process.exit(0);
  });
}

main().catch(console.error);

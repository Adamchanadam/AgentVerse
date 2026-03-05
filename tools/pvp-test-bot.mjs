#!/usr/bin/env node
/**
 * Sprint 1 PvP Test Bot — acts as Agent B for dual-player testing.
 *
 * Usage: node tools/pvp-test-bot.mjs
 *
 * This script:
 * 1. Generates a fresh Ed25519 keypair
 * 2. Bootstraps as a new agent via POST /api/auth/bootstrap
 * 3. Connects to Hub WebSocket + authenticates
 * 4. Waits for pairing request → auto-approves
 * 5. Waits for trials.started → participates in match
 * 6. Sends chat messages that will eventually trigger the rule
 */

import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";
import WebSocket from "ws";

const HUB_URL = process.env.HUB_URL || "http://localhost:3000";
const WS_URL = process.env.WS_URL || "ws://localhost:3000/ws";

// ─── Identity ────────────────────────────────────────────────

const privKey = bytesToHex(randomBytes(32));
const pubKey = bytesToHex(ed25519.getPublicKey(hexToBytes(privKey)));
console.log(`[BOT] Generated keypair — pubkey: ${pubKey.slice(0, 16)}...`);

// ─── Signing helpers ─────────────────────────────────────────

function sortedKeyJSON(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function computePayloadHash(payload) {
  return bytesToHex(sha256(utf8ToBytes(sortedKeyJSON(payload))));
}

function signEnvelope(envelope) {
  const signingMessage = sortedKeyJSON({
    event_id: envelope.event_id,
    event_type: envelope.event_type,
    nonce: envelope.nonce,
    payload_hash: computePayloadHash(envelope.payload),
    ts: envelope.ts,
  });
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(signingMessage), hexToBytes(privKey)));
  return { ...envelope, sig, sender_pubkey: pubKey };
}

function buildSignedEnvelope(eventType, payload, recipientIds) {
  const envelope = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    ts: new Date().toISOString(),
    sender_pubkey: pubKey,
    recipient_ids: recipientIds,
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload,
  };
  return signEnvelope(envelope);
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
  // 1. Get nonce
  const { nonce } = await fetchJSON("/api/auth/nonce");
  console.log(`[BOT] Got nonce: ${nonce.slice(0, 16)}...`);

  // 2. Sign nonce
  const message = `agentverse:${nonce}`;
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(message), hexToBytes(privKey)));

  // 3. Bootstrap (nonce is required in body)
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
    let currentPairId = null;
    let matchActive = false;
    let rule = null;
    let turnCount = 0;

    ws.on("open", () => {
      console.log("[BOT] WS connected, waiting for challenge...");
    });

    ws.on("message", async (data) => {
      const frame = JSON.parse(data.toString());

      // Handle auth challenge — nonce is at frame.nonce (top-level, no payload wrapper)
      if (frame.type === "challenge") {
        const nonce = frame.nonce;
        const sig = bytesToHex(ed25519.sign(hexToBytes(nonce), hexToBytes(privKey)));
        ws.send(JSON.stringify({
          type: "auth",
          payload: { pubkey: pubKey, sig },
        }));
        return;
      }

      if (frame.type === "auth_ok") {
        agentId = frame.payload.agent_id;
        console.log(`[BOT] Authenticated as ${agentId.slice(0, 8)}...`);
        resolve({ ws, agentId });
        return;
      }

      if (frame.type === "auth_error") {
        console.error("[BOT] Auth failed:", frame.payload);
        return;
      }

      if (frame.type === "submit_result") {
        const p = frame.payload;
        console.log(`[BOT] submit_result: ${p.status}${p.error ? ` (${p.error.code})` : ""}`);
        return;
      }

      // Handle events
      if (frame.type === "event") {
        const evt = frame.payload;
        console.log(`[BOT] Event: ${evt.event_type}`);

        // Auto-approve pair requests
        if (evt.event_type === "pair.requested") {
          const payload = evt.payload;
          // Need to find pair_id — query API
          console.log("[BOT] Pair request received! Fetching pair_id...");
          // Small delay for DB to commit
          await new Promise(r => setTimeout(r, 200));
          const pairingsRes = await fetchJSON("/api/pairings", {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          const pending = pairingsRes.pairings?.find(p => p.status === "pending");
          if (pending) {
            currentPairId = pending.id;
            console.log(`[BOT] Auto-approving pairing ${currentPairId.slice(0, 8)}...`);
            const approveEnv = buildSignedEnvelope("pair.approved", {
              pair_id: currentPairId,
              requester_agent_id: pending.agentAId,
            }, [pending.agentAId]);
            ws.send(JSON.stringify({ type: "submit_event", payload: approveEnv }));
          }
          return;
        }

        // Match started
        if (evt.event_type === "trials.started") {
          const payload = evt.payload;
          rule = payload.rule_payload;
          matchActive = true;
          turnCount = 0;
          console.log(`[BOT] MATCH STARTED! Rule: ${rule.display_hint} (${rule.id})`);
          console.log(`[BOT] Forbidden pattern: "${rule.pattern}"`);
          return;
        }

        // Incoming message (msg.relay) — respond with a message
        if (evt.event_type === "msg.relay" && matchActive) {
          turnCount++;
          console.log(`[BOT] Received msg.relay (turn ${turnCount})`);

          // After 2 turns, intentionally trigger the rule to end the match
          let responseText;
          if (turnCount >= 2 && rule) {
            // Trigger the forbidden pattern
            if (rule.type === "forbidden_word") {
              responseText = `I think I should say ${rule.pattern} now to test the rule.`;
            } else {
              responseText = "Let me ask you a question? That should trigger it!";
            }
            console.log(`[BOT] Intentionally triggering rule with: "${responseText}"`);
          } else {
            responseText = "That's an interesting point. Let me think about this carefully.";
          }

          // Note: In real flow, this would be encrypted. For testing, we send as plaintext msg.relay
          // The actual encryption requires the peer's X25519 public key which we'd derive from their Ed25519 key
          console.log(`[BOT] Responding: "${responseText}"`);

          // Send consumer_ack
          ws.send(JSON.stringify({
            type: "consumer_ack",
            payload: { server_seq: frame.server_seq },
          }));
          return;
        }

        // Match settled
        if (evt.event_type === "trials.settled") {
          const payload = evt.payload;
          matchActive = false;
          console.log(`[BOT] MATCH SETTLED!`);
          console.log(`[BOT] Winner: ${payload.winner_agent_id?.slice(0, 8)}...`);
          console.log(`[BOT] XP awarded: winner=${payload.xp_winner}, loser=${payload.xp_loser}`);
          return;
        }

        // Send consumer_ack for all events
        if (frame.server_seq) {
          ws.send(JSON.stringify({
            type: "consumer_ack",
            payload: { server_seq: frame.server_seq },
          }));
        }
      }
    });

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
  console.log("═══════════════════════════════════════");
  console.log("  PvP Test Bot — Sprint 1 E2E Testing");
  console.log("═══════════════════════════════════════\n");

  const { jwt, agent_id } = await bootstrap();
  const { ws, agentId } = await connectWS(jwt);

  console.log(`\n[BOT] Ready! Agent ID: ${agentId}`);
  console.log("[BOT] Waiting for pair request from browser Agent A...");
  console.log("[BOT] (Go to AgentDex → find PvP-TestBot → PAIR REQUEST)\n");

  // Poll for pending pairings (REST API doesn't send WS events)
  const pollPairings = setInterval(async () => {
    try {
      const res = await fetchJSON("/api/pairings", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const pending = res.pairings?.find(p => p.status === "pending" && p.agentBId === agentId);
      if (pending) {
        clearInterval(pollPairings);
        console.log(`[BOT] Found pending pairing ${pending.id.slice(0, 8)}... — auto-approving!`);
        // Approve via REST API
        const approveRes = await fetchJSON(`/api/pairings/${pending.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ action: "approve" }),
        });
        console.log(`[BOT] Pairing approved! Status: ${approveRes.pairing?.status}`);
        console.log("[BOT] Waiting for CHALLENGE from Agent A...");
      }
    } catch (e) {
      console.error("[BOT] Poll error:", e.message);
    }
  }, 2000);

  // Keep alive
  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "pong", payload: {} }));
    }
  }, 30000);

  process.on("SIGINT", () => {
    console.log("\n[BOT] Shutting down...");
    clearInterval(keepAlive);
    ws.close();
    process.exit(0);
  });
}

main().catch(console.error);

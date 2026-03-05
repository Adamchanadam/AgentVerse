/**
 * Tests for VerdictCoordinator and BrawlMessage.
 * Covers:
 *   1.  buildAndSign produces valid verdict + non-empty signature
 *   2.  receivePeerSig with valid sig returns SignedVerdict when both sigs present
 *   3.  receivePeerSig with invalid sig throws
 *   4.  Correct sig_winner/sig_loser when I am winner
 *   5.  Correct sig_winner/sig_loser when I am loser
 *   6.  isComplete reflects state correctly
 *   7.  Order-independent: receive peer sig first → then buildAndSign → assemble via getSignedVerdict
 *   8.  parseBrawlMessage with valid chat message
 *   9.  parseBrawlMessage with invalid JSON returns null
 *   10. serializeBrawlMessage round-trips
 */

import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { verifyVerdictSignature } from "@agentverse/shared";
import { VerdictCoordinator, type VerdictCoordinatorConfig } from "./verdict-coordinator.js";
import { parseBrawlMessage, serializeBrawlMessage, type BrawlMessage } from "./brawl-message.js";

// ── Keypair helpers ──────────────────────────────────────────────

function generateTestKeypair() {
  const privBytes = ed25519.utils.randomPrivateKey();
  const pubBytes = ed25519.getPublicKey(privBytes);
  return {
    privateKeyHex: bytesToHex(privBytes),
    publicKeyHex: bytesToHex(pubBytes),
  };
}

// ── Shared fixtures ──────────────────────────────────────────────

const agentA = generateTestKeypair();
const agentB = generateTestKeypair();

const AGENT_A_ID = "agent-a";
const AGENT_B_ID = "agent-b";

const baseParams = {
  matchId: "match-001",
  winnerId: AGENT_A_ID,
  loserId: AGENT_B_ID,
  ruleId: "rule-forbidden-word",
  triggerEventId: "evt-abc123",
  transcriptDigest: "deadbeef".repeat(8),
};

function makeCoordA(): VerdictCoordinator {
  return new VerdictCoordinator({
    myPrivKeyHex: agentA.privateKeyHex,
    myPubKeyHex: agentA.publicKeyHex,
    peerPubKeyHex: agentB.publicKeyHex,
    myAgentId: AGENT_A_ID,
  } satisfies VerdictCoordinatorConfig);
}

function makeCoordB(): VerdictCoordinator {
  return new VerdictCoordinator({
    myPrivKeyHex: agentB.privateKeyHex,
    myPubKeyHex: agentB.publicKeyHex,
    peerPubKeyHex: agentA.publicKeyHex,
    myAgentId: AGENT_B_ID,
  } satisfies VerdictCoordinatorConfig);
}

// ── VerdictCoordinator tests ─────────────────────────────────────

describe("VerdictCoordinator", () => {
  it("1. buildAndSign produces valid verdict and non-empty signature", () => {
    const coord = makeCoordA();
    const { verdict, sig } = coord.buildAndSign(baseParams);

    expect(verdict.match_id).toBe(baseParams.matchId);
    expect(verdict.winner_agent_id).toBe(AGENT_A_ID);
    expect(verdict.loser_agent_id).toBe(AGENT_B_ID);
    expect(verdict.rule_id).toBe(baseParams.ruleId);
    expect(verdict.trigger_event_id).toBe(baseParams.triggerEventId);
    expect(verdict.transcript_digest).toBe(baseParams.transcriptDigest);
    expect(sig).toMatch(/^[0-9a-f]{128}$/); // 64-byte Ed25519 sig = 128 hex chars
    // The signature must verify against agentA's public key
    expect(verifyVerdictSignature(verdict, sig, agentA.publicKeyHex)).toBe(true);
  });

  it("2. receivePeerSig with valid sig returns SignedVerdict when both sigs present", () => {
    const coordA = makeCoordA();
    const coordB = makeCoordB();

    // A builds and signs
    const { verdict, sig: sigA } = coordA.buildAndSign(baseParams);

    // B builds and signs
    const { sig: sigB } = coordB.buildAndSign(baseParams);

    // A receives B's sig
    const assembled = coordA.receivePeerSig(verdict, sigB);

    expect(assembled).not.toBeNull();
    expect(assembled!.verdict).toEqual(verdict);
    expect(assembled!.sig_winner).toBeDefined();
    expect(assembled!.sig_loser).toBeDefined();
    // A is winner, so sigA = sig_winner, sigB = sig_loser
    expect(assembled!.sig_winner).toBe(sigA);
    expect(assembled!.sig_loser).toBe(sigB);
  });

  it("3. receivePeerSig with invalid sig throws", () => {
    const coordA = makeCoordA();
    const { verdict } = coordA.buildAndSign(baseParams);

    // Use a garbage signature
    const badSig = "ff".repeat(64);
    expect(() => coordA.receivePeerSig(verdict, badSig)).toThrowError(
      "Peer verdict signature verification failed",
    );
  });

  it("4. sig_winner/sig_loser are correctly assigned when I am winner", () => {
    const coordA = makeCoordA(); // agentA = winner
    const coordB = makeCoordB(); // agentB = loser

    const { verdict, sig: sigA } = coordA.buildAndSign(baseParams);
    const { sig: sigB } = coordB.buildAndSign(baseParams);

    const assembled = coordA.receivePeerSig(verdict, sigB);
    expect(assembled).not.toBeNull();
    // A is winner: sig_winner should be A's sig
    expect(assembled!.sig_winner).toBe(sigA);
    expect(assembled!.sig_loser).toBe(sigB);
    // Both sigs must verify
    expect(verifyVerdictSignature(verdict, assembled!.sig_winner, agentA.publicKeyHex)).toBe(true);
    expect(verifyVerdictSignature(verdict, assembled!.sig_loser, agentB.publicKeyHex)).toBe(true);
  });

  it("5. sig_winner/sig_loser are correctly assigned when I am loser", () => {
    // Build from B's perspective (B is loser, A is winner)
    const coordB = makeCoordB(); // agentB = loser
    const coordA = makeCoordA(); // agentA = winner

    const { verdict, sig: sigA } = coordA.buildAndSign(baseParams);
    // B builds with same params
    const { sig: sigB } = coordB.buildAndSign(baseParams);

    // B receives A's sig
    const assembled = coordB.receivePeerSig(verdict, sigA);
    expect(assembled).not.toBeNull();
    // B is loser, so sig_winner = A's sig (peer), sig_loser = B's sig (own)
    expect(assembled!.sig_winner).toBe(sigA);
    expect(assembled!.sig_loser).toBe(sigB);
    // Both verify
    expect(verifyVerdictSignature(verdict, assembled!.sig_winner, agentA.publicKeyHex)).toBe(true);
    expect(verifyVerdictSignature(verdict, assembled!.sig_loser, agentB.publicKeyHex)).toBe(true);
  });

  it("6. isComplete reflects state correctly", () => {
    const coordA = makeCoordA();
    const coordB = makeCoordB();

    expect(coordA.isComplete).toBe(false);

    coordA.buildAndSign(baseParams);
    expect(coordA.isComplete).toBe(false); // only own sig so far

    const { verdict, sig: sigB } = coordB.buildAndSign(baseParams);
    coordA.receivePeerSig(verdict, sigB);
    expect(coordA.isComplete).toBe(true);
  });

  it("7a. receivePeerSig throws when peer verdict does not match local verdict", () => {
    const coordA = makeCoordA();
    const coordB = makeCoordB();

    // A builds original verdict
    coordA.buildAndSign(baseParams);

    // B builds a DIFFERENT verdict (different winner)
    const { verdict: differentVerdict, sig: sigB } = coordB.buildAndSign({
      ...baseParams,
      winnerId: AGENT_B_ID,
      loserId: AGENT_A_ID,
    });

    // A receives B's sig with mismatched verdict — should throw
    expect(() => coordA.receivePeerSig(differentVerdict, sigB)).toThrowError(
      "Peer verdict does not match local verdict",
    );
  });

  it("7b. order-independent: receive peer sig first, then buildAndSign, assemble via getSignedVerdict", () => {
    // B receives A's sig first, before B has signed
    const coordB = makeCoordB();
    const coordA = makeCoordA();

    // A signs first
    const { verdict, sig: sigA } = coordA.buildAndSign(baseParams);

    // B receives A's sig — should return null since B hasn't signed yet
    const partial = coordB.receivePeerSig(verdict, sigA);
    expect(partial).toBeNull(); // not yet complete

    // B now builds its own sig
    coordB.buildAndSign(baseParams);

    // Now both sigs are present — getSignedVerdict should assemble
    expect(coordB.isComplete).toBe(true);
    const assembled = coordB.getSignedVerdict();
    expect(assembled).not.toBeNull();
    // B is loser: sig_winner = A's sig, sig_loser = B's sig
    expect(assembled!.sig_winner).toBe(sigA);
    expect(assembled!.verdict.winner_agent_id).toBe(AGENT_A_ID);
    expect(assembled!.verdict.loser_agent_id).toBe(AGENT_B_ID);
  });
});

// ── BrawlMessage tests ───────────────────────────────────────────

describe("BrawlMessage", () => {
  it("8. parseBrawlMessage with valid chat message returns typed object", () => {
    const msg: BrawlMessage = { type: "chat", text: "hello world" };
    const json = JSON.stringify(msg);
    const parsed = parseBrawlMessage(json);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("chat");
    expect((parsed as { type: "chat"; text: string }).text).toBe("hello world");
  });

  it("9. parseBrawlMessage with invalid JSON returns null", () => {
    expect(parseBrawlMessage("not-json")).toBeNull();
    expect(parseBrawlMessage("{broken json")).toBeNull();
    expect(parseBrawlMessage('{"type":"unknown"}')).toBeNull();
    expect(parseBrawlMessage("null")).toBeNull();
  });

  it("10. serializeBrawlMessage round-trips correctly", () => {
    const chatMsg: BrawlMessage = { type: "chat", text: "test message" };
    const chatJson = serializeBrawlMessage(chatMsg);
    const chatParsed = parseBrawlMessage(chatJson);
    expect(chatParsed).toEqual(chatMsg);

    // Also test verdict_sig round-trip
    const coordA = makeCoordA();
    const { verdict, sig } = coordA.buildAndSign(baseParams);
    const verdictMsg: BrawlMessage = { type: "verdict_sig", verdict, sig };
    const verdictJson = serializeBrawlMessage(verdictMsg);
    const verdictParsed = parseBrawlMessage(verdictJson);
    expect(verdictParsed).toEqual(verdictMsg);
  });
});

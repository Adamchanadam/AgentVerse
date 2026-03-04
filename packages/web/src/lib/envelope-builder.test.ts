/**
 * Tests for browser envelope builder (envelope-builder.ts).
 *
 * Covers:
 *   1. buildSignedEnvelope returns valid envelope with all required fields
 *   2. Signature verifies via shared's verifyEnvelope
 *   3. Envelope has correct event_type and payload
 */

import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { verifyEnvelope } from "@agentverse/shared";
import { buildSignedEnvelope } from "./envelope-builder.js";

// ── Fixtures ────────────────────────────────────────────────────

const seed = ed25519.utils.randomPrivateKey();
const pubkey = ed25519.getPublicKey(seed);
const privHex = bytesToHex(seed);
const pubHex = bytesToHex(pubkey);

// ── Tests ───────────────────────────────────────────────────────

describe("envelope-builder", () => {
  it("returns valid envelope with all required fields", () => {
    const env = buildSignedEnvelope(
      privHex,
      pubHex,
      "msg.relay",
      {
        pair_id: "p1",
        ciphertext: "ct",
        ephemeral_pubkey: "ek",
      },
      ["recipient-1"],
    );

    expect(env.event_id).toBeTruthy();
    expect(env.event_type).toBe("msg.relay");
    expect(env.ts).toBeTruthy();
    expect(env.sender_pubkey).toBe(pubHex);
    expect(env.recipient_ids).toEqual(["recipient-1"]);
    expect(env.nonce).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
    expect(env.sig).toMatch(/^[0-9a-f]{128}$/); // 64 bytes = 128 hex chars
    expect(env.payload).toBeTruthy();
  });

  it("signature verifies via verifyEnvelope", () => {
    const env = buildSignedEnvelope(
      privHex,
      pubHex,
      "agent.registered",
      {
        display_name: "Test Agent",
        persona_tags: [],
        capabilities: [],
        visibility: "public",
      },
      [],
    );

    expect(verifyEnvelope(env)).toBe(true);
  });

  it("envelope has correct event_type and payload", () => {
    const payload = {
      pair_id: "pair-xyz",
      ciphertext: "encrypted-data",
      ephemeral_pubkey: "ephemeral-key",
    };
    const env = buildSignedEnvelope(privHex, pubHex, "msg.relay", payload, ["r1"]);

    expect(env.event_type).toBe("msg.relay");
    expect(env.payload).toEqual(payload);
  });
});

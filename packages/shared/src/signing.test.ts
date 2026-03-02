/**
 * Unit tests for EventSigningService (packages/shared/src/signing.ts)
 *
 * Covers:
 * - computePayloadHash: determinism, key-order invariance, sensitivity
 * - buildSigningMessage: correct fields, determinism
 * - signEnvelope + verifyEnvelope: round-trip, tamper detection
 *
 * Validates: Requirements 4.2, 4.3
 */

import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import type { EventEnvelope } from "./types.js";
import {
  computePayloadHash,
  buildSigningMessage,
  signEnvelope,
  verifyEnvelope,
} from "./signing.js";

// ─── Test Keypair ───────────────────────────────────────────────
// Deterministic test vector: 32-byte seed
const TEST_PRIV_HEX = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae3d55";
const TEST_PUB_HEX = bytesToHex(ed25519.getPublicKey(TEST_PRIV_HEX));

// Second keypair for "wrong pubkey" tests
const OTHER_PRIV_HEX = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4d0bd6f1";
const OTHER_PUB_HEX = bytesToHex(ed25519.getPublicKey(OTHER_PRIV_HEX));

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id: "123e4567-e89b-12d3-a456-426614174000",
    event_type: "agent.registered",
    ts: "2026-01-01T00:00:00.000Z",
    sender_pubkey: TEST_PUB_HEX,
    recipient_ids: ["recipient-1"],
    nonce: "deadbeefdeadbeefdeadbeefdeadbeef",
    sig: "",
    payload: {
      display_name: "TestAgent",
      persona_tags: ["test"],
      capabilities: [],
      visibility: "public",
    },
    ...overrides,
  };
}

// ─── computePayloadHash ─────────────────────────────────────────

describe("computePayloadHash", () => {
  it("returns a 64-character lowercase hex string (SHA-256)", () => {
    const hash = computePayloadHash(makeEnvelope().payload);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same payload", () => {
    const payload = makeEnvelope().payload;
    expect(computePayloadHash(payload)).toBe(computePayloadHash(payload));
  });

  it("changes when payload content changes", () => {
    const h1 = computePayloadHash({
      display_name: "AgentA",
      persona_tags: [],
      capabilities: [],
      visibility: "public",
    });
    const h2 = computePayloadHash({
      display_name: "AgentB",
      persona_tags: [],
      capabilities: [],
      visibility: "public",
    });
    expect(h1).not.toBe(h2);
  });

  it("is key-order invariant (canonical JSON)", () => {
    // Same logical content, different key insertion order
    const h1 = computePayloadHash({
      display_name: "Test",
      persona_tags: ["a", "b"],
      capabilities: [],
      visibility: "public",
    });
    const h2 = computePayloadHash({
      visibility: "public",
      capabilities: [],
      persona_tags: ["a", "b"],
      display_name: "Test",
    });
    expect(h1).toBe(h2);
  });
});

// ─── buildSigningMessage ────────────────────────────────────────

describe("buildSigningMessage", () => {
  it("returns a Uint8Array", () => {
    expect(buildSigningMessage(makeEnvelope())).toBeInstanceOf(Uint8Array);
  });

  it("encodes exactly the five required fields", () => {
    const env = makeEnvelope();
    const msg = buildSigningMessage(env);
    const obj = JSON.parse(new TextDecoder().decode(msg));

    expect(obj).toHaveProperty("event_id", env.event_id);
    expect(obj).toHaveProperty("event_type", env.event_type);
    expect(obj).toHaveProperty("nonce", env.nonce);
    expect(obj).toHaveProperty("payload_hash");
    expect(obj).toHaveProperty("ts", env.ts);

    // Must NOT include sig, sender_pubkey, recipient_ids, or payload itself
    expect(obj).not.toHaveProperty("sig");
    expect(obj).not.toHaveProperty("sender_pubkey");
    expect(obj).not.toHaveProperty("recipient_ids");
    expect(obj).not.toHaveProperty("payload");
  });

  it("payload_hash field matches computePayloadHash(envelope.payload)", () => {
    const env = makeEnvelope();
    const msg = buildSigningMessage(env);
    const obj = JSON.parse(new TextDecoder().decode(msg));
    expect(obj.payload_hash).toBe(computePayloadHash(env.payload));
  });

  it("is deterministic for the same envelope", () => {
    const env = makeEnvelope();
    expect(buildSigningMessage(env)).toEqual(buildSigningMessage(env));
  });
});

// ─── signEnvelope + verifyEnvelope ─────────────────────────────

describe("signEnvelope + verifyEnvelope", () => {
  it("round-trip: signed envelope verifies successfully", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    expect(sig).toMatch(/^[0-9a-f]{128}$/); // 64-byte Ed25519 signature = 128 hex chars
    expect(verifyEnvelope({ ...env, sig })).toBe(true);
  });

  it("verifyEnvelope returns false when sig was made with a different private key", () => {
    const env = makeEnvelope();
    const sigWithOtherKey = signEnvelope(env, OTHER_PRIV_HEX);
    // But sender_pubkey is TEST_PUB_HEX → mismatch
    expect(verifyEnvelope({ ...env, sig: sigWithOtherKey })).toBe(false);
  });

  it("verifyEnvelope returns false when sender_pubkey is wrong", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    // Replace pubkey with a different one
    expect(verifyEnvelope({ ...env, sig, sender_pubkey: OTHER_PUB_HEX })).toBe(false);
  });

  it("verifyEnvelope returns false for tampered sig (single char changed)", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    const tampered = sig.replace(sig[0], sig[0] === "a" ? "b" : "a");
    expect(verifyEnvelope({ ...env, sig: tampered })).toBe(false);
  });

  it("verifyEnvelope returns false for invalid hex in sig", () => {
    const env = makeEnvelope({ sig: "not-valid-hex!!" });
    expect(verifyEnvelope(env)).toBe(false);
  });

  it("verifyEnvelope returns false when event_id is tampered after signing", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    expect(verifyEnvelope({ ...env, sig, event_id: "tampered-event-id" })).toBe(false);
  });

  it("verifyEnvelope returns false when event_type is tampered after signing", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    expect(verifyEnvelope({ ...env, sig, event_type: "agent.updated" as const })).toBe(false);
  });

  it("verifyEnvelope returns false when ts is tampered after signing", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    expect(verifyEnvelope({ ...env, sig, ts: "2099-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("verifyEnvelope returns false when nonce is tampered after signing", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    expect(verifyEnvelope({ ...env, sig, nonce: "0000000000000000000000000000cafe" })).toBe(false);
  });

  it("verifyEnvelope returns false when payload is tampered after signing", () => {
    const env = makeEnvelope();
    const sig = signEnvelope(env, TEST_PRIV_HEX);
    const tamperedPayload = {
      display_name: "TAMPERED",
      persona_tags: [],
      capabilities: [],
      visibility: "public" as const,
    };
    expect(verifyEnvelope({ ...env, sig, payload: tamperedPayload })).toBe(false);
  });
});

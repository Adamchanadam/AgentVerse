/**
 * Tests for browser E2E helpers (e2e-helpers.ts).
 *
 * Covers:
 *   1. deriveEncryptionKeypair returns 32-byte X25519 keys
 *   2. encryptChat + decryptChat round-trip
 *   3. encryptChat output has base64 ciphertext + hex ephemeral_pubkey
 *   4. decryptChat fails with wrong key
 *   5. decryptChat fails with tampered AAD
 */

import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { deriveEncryptionKeypair, encryptChat, decryptChat, type AadParts } from "./e2e-helpers.js";

// ── Fixtures ────────────────────────────────────────────────────

const SEED_A = ed25519.utils.randomPrivateKey();
const SEED_A_HEX = bytesToHex(SEED_A);
const SEED_B = ed25519.utils.randomPrivateKey();
const SEED_B_HEX = bytesToHex(SEED_B);

const TEST_AAD: AadParts = {
  event_id: "evt-test-001",
  pair_id: "pair-test-001",
  sender_pubkey: "aaaa",
};

// ── Tests ───────────────────────────────────────────────────────

describe("e2e-helpers", () => {
  it("deriveEncryptionKeypair returns 32-byte X25519 keys", () => {
    const kp = deriveEncryptionKeypair(SEED_A_HEX);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it("encryptChat + decryptChat round-trip", () => {
    deriveEncryptionKeypair(SEED_A_HEX);
    const recipient = deriveEncryptionKeypair(SEED_B_HEX);
    const recipientPubHex = bytesToHex(recipient.publicKey);

    const encrypted = encryptChat("Hello browser E2E!", recipientPubHex, TEST_AAD);
    const decrypted = decryptChat(
      encrypted.ciphertext,
      encrypted.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );

    expect(decrypted).toBe("Hello browser E2E!");
  });

  it("encryptChat output has base64 ciphertext and hex ephemeral_pubkey", () => {
    const recipient = deriveEncryptionKeypair(SEED_B_HEX);
    const recipientPubHex = bytesToHex(recipient.publicKey);

    const encrypted = encryptChat("test", recipientPubHex, TEST_AAD);

    // ciphertext should be valid base64 (no hex chars outside base64 range)
    expect(() => atob(encrypted.ciphertext)).not.toThrow();

    // ephemeral_pubkey should be 64-char hex (32 bytes)
    expect(encrypted.ephemeral_pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("decryptChat fails with wrong key", () => {
    const recipient = deriveEncryptionKeypair(SEED_B_HEX);
    const wrongRecipient = deriveEncryptionKeypair(bytesToHex(ed25519.utils.randomPrivateKey()));
    const recipientPubHex = bytesToHex(recipient.publicKey);

    const encrypted = encryptChat("secret", recipientPubHex, TEST_AAD);

    expect(() =>
      decryptChat(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        wrongRecipient.privateKey,
        TEST_AAD,
      ),
    ).toThrow();
  });

  it("decryptChat fails with tampered AAD", () => {
    const recipient = deriveEncryptionKeypair(SEED_B_HEX);
    const recipientPubHex = bytesToHex(recipient.publicKey);

    const encrypted = encryptChat("secret", recipientPubHex, TEST_AAD);
    const tamperedAad: AadParts = { ...TEST_AAD, pair_id: "tampered" };

    expect(() =>
      decryptChat(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipient.privateKey,
        tamperedAad,
      ),
    ).toThrow();
  });
});

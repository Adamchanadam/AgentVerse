/**
 * Unit tests for E2E v1 Encryption Module (packages/shared/src/e2e.ts)
 *
 * Covers:
 * - initSodium: idempotent re-initialization
 * - generateX25519Keypair: 32-byte keys, uniqueness
 * - ed25519KeyToX25519: public and private key conversion
 * - Round-trip: simple message, empty string, unicode
 * - Failure cases: wrong key, tampered AAD fields, tampered ciphertext
 * - Ephemeral uniqueness: same plaintext produces different ciphertext
 * - Ciphertext format: length = 24 + plaintext_length + 16
 *
 * Validates: Requirements 4.2 (E2E Encryption)
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initSodium,
  getSodium,
  generateX25519Keypair,
  ed25519KeyToX25519,
  encryptMessage,
  decryptMessage,
} from "./e2e.js";
import type { AadParts } from "./e2e.js";

// ── Setup ───────────────────────────────────────────────────────

beforeAll(async () => {
  await initSodium();
});

const TEST_AAD: AadParts = {
  event_id: "evt-123e4567-e89b-12d3-a456-426614174000",
  pair_id: "pair-abcdef01-2345-6789-abcd-ef0123456789",
  sender_pubkey: "deadbeefdeadbeefdeadbeefdeadbeef",
};

// ── initSodium ──────────────────────────────────────────────────

describe("initSodium", () => {
  it("can be called multiple times without error (idempotent)", async () => {
    await expect(initSodium()).resolves.toBeUndefined();
    await expect(initSodium()).resolves.toBeUndefined();
    await expect(initSodium()).resolves.toBeUndefined();
  });
});

// ── generateX25519Keypair ───────────────────────────────────────

describe("generateX25519Keypair", () => {
  it("returns 32-byte public and private keys", () => {
    const kp = generateX25519Keypair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it("generates unique keypairs on each call", () => {
    const kp1 = generateX25519Keypair();
    const kp2 = generateX25519Keypair();
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.privateKey).not.toEqual(kp2.privateKey);
  });
});

// ── ed25519KeyToX25519 ──────────────────────────────────────────

describe("ed25519KeyToX25519", () => {
  it("converts an Ed25519 public key to a 32-byte X25519 public key", () => {
    const sodium = getSodium();
    const edKp = sodium.crypto_sign_keypair();
    const x25519Pub = ed25519KeyToX25519(edKp.publicKey, "public");
    expect(x25519Pub).toBeInstanceOf(Uint8Array);
    expect(x25519Pub.length).toBe(32);
  });

  it("converts an Ed25519 private key to a 32-byte X25519 private key", () => {
    const sodium = getSodium();
    const edKp = sodium.crypto_sign_keypair();
    const x25519Priv = ed25519KeyToX25519(edKp.privateKey, "private");
    expect(x25519Priv).toBeInstanceOf(Uint8Array);
    expect(x25519Priv.length).toBe(32);
  });

  it("converted keys are usable for ECDH", () => {
    const sodium = getSodium();
    // Generate two Ed25519 keypairs and convert
    const ed1 = sodium.crypto_sign_keypair();
    const ed2 = sodium.crypto_sign_keypair();
    const x1Priv = ed25519KeyToX25519(ed1.privateKey, "private");
    const x1Pub = ed25519KeyToX25519(ed1.publicKey, "public");
    const x2Priv = ed25519KeyToX25519(ed2.privateKey, "private");
    const x2Pub = ed25519KeyToX25519(ed2.publicKey, "public");

    // ECDH should produce the same shared secret from both sides
    const ss1 = sodium.crypto_scalarmult(x1Priv, x2Pub);
    const ss2 = sodium.crypto_scalarmult(x2Priv, x1Pub);
    expect(ss1).toEqual(ss2);
  });
});

// ── Round-trip encrypt/decrypt ──────────────────────────────────

describe("round-trip encrypt/decrypt", () => {
  it("encrypts and decrypts a simple message", () => {
    const recipient = generateX25519Keypair();
    const msg = "Hello, AgentVerse!";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const decrypted = decryptMessage(
      encrypted.ciphertext,
      encrypted.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );

    expect(decrypted).toBe(msg);
  });

  it("encrypts and decrypts an empty string", () => {
    const recipient = generateX25519Keypair();
    const msg = "";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const decrypted = decryptMessage(
      encrypted.ciphertext,
      encrypted.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );

    expect(decrypted).toBe(msg);
  });

  it("encrypts and decrypts a unicode message", () => {
    const recipient = generateX25519Keypair();
    const msg = "Emoji test \u{1F980}\u{1F389} and CJK \u4F60\u597D\u4E16\u754C \uD55C\uAD6D\uC5B4";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const decrypted = decryptMessage(
      encrypted.ciphertext,
      encrypted.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );

    expect(decrypted).toBe(msg);
  });
});

// ── Failure cases ───────────────────────────────────────────────

describe("decryption failure cases", () => {
  it("fails with wrong recipient private key", () => {
    const recipient = generateX25519Keypair();
    const wrongRecipient = generateX25519Keypair();
    const msg = "secret message";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);

    expect(() =>
      decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        wrongRecipient.privateKey,
        TEST_AAD,
      ),
    ).toThrow();
  });

  it("fails with tampered AAD event_id", () => {
    const recipient = generateX25519Keypair();
    const msg = "secret message";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const tamperedAad: AadParts = { ...TEST_AAD, event_id: "tampered-event-id" };

    expect(() =>
      decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipient.privateKey,
        tamperedAad,
      ),
    ).toThrow();
  });

  it("fails with tampered AAD pair_id", () => {
    const recipient = generateX25519Keypair();
    const msg = "secret message";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const tamperedAad: AadParts = { ...TEST_AAD, pair_id: "tampered-pair-id" };

    expect(() =>
      decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipient.privateKey,
        tamperedAad,
      ),
    ).toThrow();
  });

  it("fails with tampered AAD sender_pubkey", () => {
    const recipient = generateX25519Keypair();
    const msg = "secret message";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const tamperedAad: AadParts = {
      ...TEST_AAD,
      sender_pubkey: "0000000000000000000000000000cafe",
    };

    expect(() =>
      decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipient.privateKey,
        tamperedAad,
      ),
    ).toThrow();
  });

  it("fails with tampered ciphertext (single byte flipped)", () => {
    const recipient = generateX25519Keypair();
    const msg = "secret message";

    const encrypted = encryptMessage(msg, recipient.publicKey, TEST_AAD);

    // Tamper a byte in the encrypted data portion (after the 24-byte nonce)
    const tampered = new Uint8Array(encrypted.ciphertext);
    const byteIndex = 24; // first byte of encrypted data
    tampered[byteIndex] = tampered[byteIndex]! ^ 0xff;

    expect(() =>
      decryptMessage(tampered, encrypted.ephemeral_pubkey, recipient.privateKey, TEST_AAD),
    ).toThrow();
  });
});

// ── Ephemeral uniqueness ────────────────────────────────────────

describe("ephemeral uniqueness", () => {
  it("same plaintext produces different ciphertext on each call", () => {
    const recipient = generateX25519Keypair();
    const msg = "identical plaintext";

    const enc1 = encryptMessage(msg, recipient.publicKey, TEST_AAD);
    const enc2 = encryptMessage(msg, recipient.publicKey, TEST_AAD);

    // Ephemeral public keys should differ
    expect(enc1.ephemeral_pubkey).not.toEqual(enc2.ephemeral_pubkey);

    // Ciphertext should differ (different nonce + different ephemeral key)
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);

    // Both should still decrypt correctly
    const dec1 = decryptMessage(
      enc1.ciphertext,
      enc1.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );
    const dec2 = decryptMessage(
      enc2.ciphertext,
      enc2.ephemeral_pubkey,
      recipient.privateKey,
      TEST_AAD,
    );
    expect(dec1).toBe(msg);
    expect(dec2).toBe(msg);
  });
});

// ── Ciphertext format ───────────────────────────────────────────

describe("ciphertext format", () => {
  it("has length = 24 (nonce) + plaintext_bytes + 16 (tag)", () => {
    const recipient = generateX25519Keypair();

    // Test with various plaintext lengths
    const plaintexts = ["", "a", "Hello, World!", "x".repeat(1000)];

    for (const pt of plaintexts) {
      const encrypted = encryptMessage(pt, recipient.publicKey, TEST_AAD);
      const ptBytes = new TextEncoder().encode(pt);
      const expectedLen = 24 + ptBytes.length + 16;
      expect(encrypted.ciphertext.length).toBe(expectedLen);
    }
  });

  it("ephemeral_pubkey is 32 bytes", () => {
    const recipient = generateX25519Keypair();
    const encrypted = encryptMessage("test", recipient.publicKey, TEST_AAD);
    expect(encrypted.ephemeral_pubkey.length).toBe(32);
  });
});

/**
 * Property 16: E2E Round-Trip PBT
 *
 * Verifies X25519 + HKDF-SHA-256 + XChaCha20-Poly1305 encryption via
 * property-based testing with fast-check.
 *
 * Properties:
 *   1. Round-trip: encrypt then decrypt restores original plaintext
 *   2. Tampered event_id: decryption SHALL throw
 *   3. Tampered pair_id: decryption SHALL throw
 *   4. Tampered sender_pubkey: decryption SHALL throw
 *   5. Wrong recipient key: decryption SHALL throw
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";
import {
  initSodium,
  generateX25519Keypair,
  encryptMessage,
  decryptMessage,
  type AadParts,
} from "./e2e.js";

// ── AAD Arbitrary ───────────────────────────────────────────────

const aadArb = fc.record({
  event_id: fc.uuid(),
  pair_id: fc.uuid(),
  sender_pubkey: fc.hexaString({ minLength: 64, maxLength: 64 }),
});

// ── Tests ───────────────────────────────────────────────────────

describe("Property 16: E2E Round-Trip (X25519 + HKDF + XChaCha20-Poly1305)", () => {
  beforeAll(async () => {
    await initSodium();
  });

  // 1. Round-trip: encrypt → decrypt restores original plaintext
  it("P16.1 round-trip: encrypt then decrypt restores plaintext", () => {
    fc.assert(
      fc.property(fc.string(), aadArb, (plaintext, aad) => {
        const recipient = generateX25519Keypair();
        const encrypted = encryptMessage(plaintext, recipient.publicKey, aad);
        const decrypted = decryptMessage(
          encrypted.ciphertext,
          encrypted.ephemeral_pubkey,
          recipient.privateKey,
          aad,
        );
        expect(decrypted).toBe(plaintext);
      }),
      { numRuns: 100 },
    );
  });

  // 2. Tampered event_id: decryption SHALL throw
  it("P16.2 tampered event_id causes decryption failure", () => {
    fc.assert(
      fc.property(fc.string(), aadArb, fc.uuid(), (plaintext, aad, tamperedEventId) => {
        fc.pre(tamperedEventId !== aad.event_id);

        const recipient = generateX25519Keypair();
        const encrypted = encryptMessage(plaintext, recipient.publicKey, aad);

        const tamperedAad: AadParts = {
          ...aad,
          event_id: tamperedEventId,
        };

        expect(() =>
          decryptMessage(
            encrypted.ciphertext,
            encrypted.ephemeral_pubkey,
            recipient.privateKey,
            tamperedAad,
          ),
        ).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  // 3. Tampered pair_id: decryption SHALL throw
  it("P16.3 tampered pair_id causes decryption failure", () => {
    fc.assert(
      fc.property(fc.string(), aadArb, fc.uuid(), (plaintext, aad, tamperedPairId) => {
        fc.pre(tamperedPairId !== aad.pair_id);

        const recipient = generateX25519Keypair();
        const encrypted = encryptMessage(plaintext, recipient.publicKey, aad);

        const tamperedAad: AadParts = {
          ...aad,
          pair_id: tamperedPairId,
        };

        expect(() =>
          decryptMessage(
            encrypted.ciphertext,
            encrypted.ephemeral_pubkey,
            recipient.privateKey,
            tamperedAad,
          ),
        ).toThrow();
      }),
      { numRuns: 50 },
    );
  });

  // 4. Tampered sender_pubkey: decryption SHALL throw
  it("P16.4 tampered sender_pubkey causes decryption failure", () => {
    fc.assert(
      fc.property(
        fc.string(),
        aadArb,
        fc.hexaString({ minLength: 64, maxLength: 64 }),
        (plaintext, aad, tamperedPubkey) => {
          fc.pre(tamperedPubkey !== aad.sender_pubkey);

          const recipient = generateX25519Keypair();
          const encrypted = encryptMessage(plaintext, recipient.publicKey, aad);

          const tamperedAad: AadParts = {
            ...aad,
            sender_pubkey: tamperedPubkey,
          };

          expect(() =>
            decryptMessage(
              encrypted.ciphertext,
              encrypted.ephemeral_pubkey,
              recipient.privateKey,
              tamperedAad,
            ),
          ).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  // 5. Wrong recipient key: decryption SHALL throw
  it("P16.5 wrong recipient private key causes decryption failure", () => {
    fc.assert(
      fc.property(fc.string(), aadArb, (plaintext, aad) => {
        const recipient = generateX25519Keypair();
        const wrongRecipient = generateX25519Keypair();

        const encrypted = encryptMessage(plaintext, recipient.publicKey, aad);

        expect(() =>
          decryptMessage(
            encrypted.ciphertext,
            encrypted.ephemeral_pubkey,
            wrongRecipient.privateKey,
            aad,
          ),
        ).toThrow();
      }),
      { numRuns: 50 },
    );
  });
});

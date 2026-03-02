import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { generateNonce, verifyAuth } from "./auth-handler.js";

describe("generateNonce", () => {
  it("returns a 64-char hex string (32 bytes)", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(64);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different values on each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});

describe("verifyAuth", () => {
  /** Helper: generate a fresh keypair and sign a nonce. */
  function signNonce(nonceHex: string) {
    const privKey = ed25519.utils.randomPrivateKey();
    const pubKey = ed25519.getPublicKey(privKey);
    const sig = ed25519.sign(hexToBytes(nonceHex), privKey);
    return {
      pubkeyHex: bytesToHex(pubKey),
      sigHex: bytesToHex(sig),
      privKey,
    };
  }

  it("returns success for a valid signature", () => {
    const nonce = generateNonce();
    const { pubkeyHex, sigHex } = signNonce(nonce);

    const result = verifyAuth(nonce, pubkeyHex, sigHex);
    expect(result).toEqual({ ok: true });
  });

  it("returns failure for an invalid signature", () => {
    const nonce = generateNonce();
    const { pubkeyHex, sigHex } = signNonce(nonce);

    // Flip one byte in the signature
    const tampered = sigHex.slice(0, -2) + (sigHex.endsWith("00") ? "ff" : "00");

    const result = verifyAuth(nonce, pubkeyHex, tampered);
    expect(result.ok).toBe(false);
  });

  it("returns failure for a wrong public key", () => {
    const nonce = generateNonce();
    const { sigHex } = signNonce(nonce);

    // Generate a different keypair
    const otherPub = ed25519.getPublicKey(ed25519.utils.randomPrivateKey());
    const otherPubHex = bytesToHex(otherPub);

    const result = verifyAuth(nonce, otherPubHex, sigHex);
    expect(result.ok).toBe(false);
  });

  it("returns failure for malformed hex input", () => {
    const result = verifyAuth("not-hex", "also-not-hex", "bad-sig");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

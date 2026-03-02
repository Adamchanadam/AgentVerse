/**
 * Challenge-response authentication handler for WebSocket connections.
 *
 * Flow:
 * 1. Hub generates a random 32-byte nonce and sends it as a challenge.
 * 2. Plugin signs the nonce bytes with its Ed25519 private key.
 * 3. Hub verifies the signature against the Plugin's public key.
 *
 * Spec: tasks.md Task 7 sub-task 2 (7.1 auth)
 */

import { randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes } from "@noble/hashes/utils";

/** Result of an authentication verification attempt. */
export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Generate a cryptographically random 32-byte nonce as a 64-char hex string.
 *
 * Used as the challenge in the auth handshake: the Plugin must sign these
 * raw bytes (NOT the hex string) with its Ed25519 private key.
 */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Verify a Plugin's auth response.
 *
 * @param nonceHex  - The hex-encoded 32-byte nonce that was sent as the challenge.
 * @param pubkeyHex - The hex-encoded 32-byte Ed25519 public key of the Plugin.
 * @param sigHex    - The hex-encoded 64-byte Ed25519 signature over the nonce bytes.
 * @returns `{ ok: true }` on success, `{ ok: false, error }` on any failure.
 */
export function verifyAuth(nonceHex: string, pubkeyHex: string, sigHex: string): AuthResult {
  try {
    const nonce = hexToBytes(nonceHex);
    const pubkey = hexToBytes(pubkeyHex);
    const sig = hexToBytes(sigHex);

    const valid = ed25519.verify(sig, nonce, pubkey);
    if (valid) {
      return { ok: true };
    }
    return { ok: false, error: "invalid signature" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

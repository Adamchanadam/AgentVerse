/**
 * Verdict signing and verification for Prompt Brawl settlement.
 * Spec: PROJECT_MASTER_SPEC §16.3, §16.4
 *
 * Uses the same sortedKeyJSON canonical format as event envelope signing.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { Verdict } from "./trial-types.js";
import { sortedKeyJSON } from "./signing.js";

/**
 * Sign a Verdict struct with an Ed25519 private key.
 * Returns hex-encoded 64-byte signature.
 */
export function signVerdict(verdict: Verdict, privateKeyHex: string): string {
  const msg = utf8ToBytes(sortedKeyJSON(verdict));
  const sig = ed25519.sign(msg, hexToBytes(privateKeyHex));
  return bytesToHex(sig);
}

/**
 * Verify an Ed25519 signature over a Verdict struct.
 * Returns false on any error.
 */
export function verifyVerdictSignature(
  verdict: Verdict,
  sigHex: string,
  pubkeyHex: string,
): boolean {
  try {
    const msg = utf8ToBytes(sortedKeyJSON(verdict));
    return ed25519.verify(hexToBytes(sigHex), msg, hexToBytes(pubkeyHex));
  } catch {
    return false;
  }
}

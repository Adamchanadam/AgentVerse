/**
 * Browser E2E encryption helpers — thin wrappers around @agentverse/shared e2e.
 *
 * Converts between hex/base64 wire formats and the Uint8Array crypto layer.
 * MsgRelayPayload.ciphertext is base64-encoded per types.ts spec.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { ed25519KeyToX25519, encryptMessage, decryptMessage } from "@agentverse/shared";
import type { AadParts, EncryptedMessage, X25519Keypair } from "@agentverse/shared";

export type { AadParts, EncryptedMessage, X25519Keypair };

/** Derive X25519 encryption keypair from Ed25519 identity key (32-byte seed hex). */
export function deriveEncryptionKeypair(ed25519SeedHex: string): X25519Keypair {
  const seed = hexToBytes(ed25519SeedHex);
  const edPub = ed25519.getPublicKey(seed);
  return {
    privateKey: ed25519KeyToX25519(seed, "private"),
    publicKey: ed25519KeyToX25519(edPub, "public"),
  };
}

/** Encrypt plaintext → { ciphertext: base64, ephemeral_pubkey: hex } */
export function encryptChat(
  plaintext: string,
  recipientX25519PubHex: string,
  aadParts: AadParts,
): { ciphertext: string; ephemeral_pubkey: string } {
  const result = encryptMessage(plaintext, hexToBytes(recipientX25519PubHex), aadParts);
  return {
    ciphertext: base64Encode(result.ciphertext),
    ephemeral_pubkey: bytesToHex(result.ephemeral_pubkey),
  };
}

/** Decrypt ciphertext (base64) → plaintext string */
export function decryptChat(
  ciphertextBase64: string,
  ephemeralPubHex: string,
  myX25519PrivKey: Uint8Array,
  aadParts: AadParts,
): string {
  return decryptMessage(
    base64Decode(ciphertextBase64),
    hexToBytes(ephemeralPubHex),
    myX25519PrivKey,
    aadParts,
  );
}

// ── Base64 helpers (browser-native) ─────────────────────────────

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

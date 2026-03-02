/**
 * EventSigningService — Ed25519 event signing and verification.
 *
 * Spec: PROJECT_MASTER_SPEC.md §4.1
 * - Algorithm: Ed25519 (@noble/curves/ed25519)
 * - payload_hash: hex(SHA-256(sortedKeyJSON(payload)))
 * - Signing message: sorted-key JSON of {event_id, event_type, nonce, payload_hash, ts}
 * - Private key NEVER included in any return value
 *
 * Validates: Requirements 4.2, 4.3
 */

import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { EventEnvelope, EventPayload } from "./types.js";

/** Return a canonical sorted-key JSON string (recursive). */
function sortedKeyJSON(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value as unknown;
  });
}

/**
 * Compute SHA-256 of the canonical sorted-key JSON of an event payload.
 * Returns lowercase hex string (64 chars).
 *
 * `payload_hash = hex(SHA-256(sortedKeyJSON(payload)))`
 */
export function computePayloadHash(payload: EventPayload): string {
  const canonical = sortedKeyJSON(payload);
  const hash = sha256(utf8ToBytes(canonical));
  return bytesToHex(hash);
}

/**
 * Build the Ed25519 signing message for an envelope.
 *
 * Covers: event_id, event_type, nonce, payload_hash, ts (sorted keys).
 * Does NOT include sig, sender_pubkey, recipient_ids, or the raw payload.
 *
 * Returns UTF-8 bytes of the sorted-key JSON object.
 */
export function buildSigningMessage(envelope: EventEnvelope): Uint8Array {
  const payload_hash = computePayloadHash(envelope.payload);
  const signable = sortedKeyJSON({
    event_id: envelope.event_id,
    event_type: envelope.event_type,
    nonce: envelope.nonce,
    payload_hash,
    ts: envelope.ts,
  });
  return utf8ToBytes(signable);
}

/**
 * Sign an EventEnvelope using an Ed25519 private key (hex-encoded seed).
 * Returns hex-encoded 64-byte signature.
 *
 * The caller is responsible for setting envelope.sig to the returned value.
 * The private key is used only for signing and is never stored or returned.
 */
export function signEnvelope(envelope: EventEnvelope, privateKeyHex: string): string {
  const privKey = hexToBytes(privateKeyHex);
  const msg = buildSigningMessage(envelope);
  const sig = ed25519.sign(msg, privKey);
  return bytesToHex(sig);
}

/**
 * Verify the Ed25519 signature of an EventEnvelope.
 *
 * Uses envelope.sender_pubkey (hex) and envelope.sig (hex) to verify
 * the signing message built from the envelope's fields.
 *
 * Returns false on any error (invalid hex, wrong key, tampered fields, etc.).
 */
export function verifyEnvelope(envelope: EventEnvelope): boolean {
  try {
    const msg = buildSigningMessage(envelope);
    const sig = hexToBytes(envelope.sig);
    const pubkey = hexToBytes(envelope.sender_pubkey);
    return ed25519.verify(sig, msg, pubkey);
  } catch {
    return false;
  }
}

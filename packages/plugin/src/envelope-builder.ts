/**
 * EventEnvelope builder — constructs and signs envelopes using IdentityManager.
 *
 * Uses buildSigningMessage from @agentverse/shared to compute the signing
 * message, then delegates to IdentityManager.sign() so the private key
 * never leaves the identity module.
 *
 * Spec: tasks.md 16.2, 18
 */

import { randomUUID } from "crypto";
import { randomBytes } from "crypto";
import { bytesToHex } from "@noble/hashes/utils";
import {
  buildSigningMessage,
  type EventEnvelope,
  type EventPayload,
  type EventType,
} from "@agentverse/shared";
import type { IdentityManager } from "./identity.js";

export interface EnvelopeOptions {
  eventType: EventType;
  payload: EventPayload;
  recipientIds?: string[];
}

/**
 * Build a fully signed EventEnvelope using the IdentityManager's keypair.
 *
 * The IdentityManager.sign() method handles Ed25519 signing without
 * exposing the private key hex.
 */
export function buildSignedEnvelope(
  identity: IdentityManager,
  opts: EnvelopeOptions,
): EventEnvelope {
  identity.ensureKeypair();

  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: opts.eventType,
    ts: new Date().toISOString(),
    sender_pubkey: identity.getPublicKeyHex(),
    recipient_ids: opts.recipientIds ?? [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: opts.payload,
  };

  const sigMsg = buildSigningMessage(envelope);
  envelope.sig = identity.sign(sigMsg);

  return envelope;
}

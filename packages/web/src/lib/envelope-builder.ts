/**
 * Browser envelope builder — builds and signs EventEnvelope using shared signing.
 *
 * Uses browser-native crypto.randomUUID() and crypto.getRandomValues().
 */

import { signEnvelope } from "@agentverse/shared";
import type { EventEnvelope, EventType, EventPayload } from "@agentverse/shared";
import { bytesToHex } from "@noble/hashes/utils";

export function buildSignedEnvelope(
  privateKeyHex: string,
  publicKeyHex: string,
  eventType: EventType,
  payload: EventPayload,
  recipientIds: string[],
): EventEnvelope {
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const envelope: EventEnvelope = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    ts: new Date().toISOString(),
    sender_pubkey: publicKeyHex,
    recipient_ids: recipientIds,
    nonce,
    sig: "",
    payload,
  };
  envelope.sig = signEnvelope(envelope, privateKeyHex);
  return envelope;
}

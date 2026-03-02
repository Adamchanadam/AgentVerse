/**
 * msg.relay handler — blind forwarding with zero-persistence and TTL modes.
 *
 * Handles msg.relay event submissions separately from other event types.
 * Two modes:
 * - Zero-persistence (ttlDays === 0): Accept and forward, no DB writes.
 * - TTL mode (ttlDays > 0): Insert placeholder in events + ciphertext in offline_messages.
 *
 * Flow:
 * 1. Verify Ed25519 signature via verifyEnvelope
 * 2. Data policy check via validatePayload
 * 3. Verify active pairing (pair_id lookup)
 * 4. Verify sender is part of the pairing
 * 5. Zero-persistence: return accepted with no server_seq
 * 6. TTL mode: store placeholder event + offline message, return server_seq
 *
 * Spec: tasks.md Task 7 sub-task 6 (7.6 msg.relay handler)
 */

import { verifyEnvelope, type EventEnvelope, type SubmitResultFrame } from "@agentverse/shared";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { AgentRepository } from "../../db/repositories/agent.repository.js";
import type { PairingRepository } from "../../db/repositories/pairing.repository.js";
import type { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { validatePayload } from "./data-policy.js";

export interface MsgRelayDeps {
  eventRepo: EventRepository;
  agentRepo: AgentRepository;
  pairingRepo: PairingRepository;
  offlineMsgRepo: OfflineMessageRepository;
  ttlDays: number;
}

export type MsgRelayResult = SubmitResultFrame;

export async function handleMsgRelay(
  envelope: EventEnvelope,
  deps: MsgRelayDeps,
): Promise<MsgRelayResult> {
  const now = new Date().toISOString();

  // 1. Verify signature
  if (!verifyEnvelope(envelope)) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "signature_invalid", message: "Event signature verification failed" },
    };
  }

  // 2. Data policy check
  const policy = validatePayload(
    envelope.event_type,
    envelope.payload as unknown as Record<string, unknown>,
  );
  if (!policy.ok) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "data_policy_violation", message: policy.error },
    };
  }

  // 3. Verify active pairing
  const payload = envelope.payload as unknown as Record<string, unknown>;
  const pairId = payload.pair_id as string;
  const pairing = await deps.pairingRepo.findById(pairId);
  if (!pairing || pairing.status !== "active") {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "pair_not_active", message: "Pairing not found or not active" },
    };
  }

  // 4. Verify sender is in pairing
  const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
  if (
    !senderAgent ||
    (senderAgent.id !== pairing.agentAId && senderAgent.id !== pairing.agentBId)
  ) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "not_in_pairing", message: "Sender is not part of this pairing" },
    };
  }

  // 5. Zero-persistence mode (ttlDays === 0): no DB write
  if (deps.ttlDays === 0) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "accepted",
    };
  }

  // 6. TTL mode (ttlDays > 0): store placeholder event + offline message
  const event = await deps.eventRepo.insert({
    eventId: envelope.event_id,
    eventType: envelope.event_type,
    ts: new Date(envelope.ts),
    senderPubkey: envelope.sender_pubkey,
    recipientIds: envelope.recipient_ids,
    nonce: envelope.nonce,
    sig: envelope.sig,
    payload: { pair_id: pairId }, // NO ciphertext in events table
  });

  const ciphertext = payload.ciphertext as string;
  const expiresAt = new Date(Date.now() + deps.ttlDays * 86_400_000);

  await deps.offlineMsgRepo.insert({
    serverSeq: event.serverSeq,
    pairId,
    senderPubkey: envelope.sender_pubkey,
    ciphertext,
    expiresAt,
  });

  return {
    event_id: envelope.event_id,
    server_seq: String(event.serverSeq),
    result_ts: now,
    status: "accepted",
  };
}

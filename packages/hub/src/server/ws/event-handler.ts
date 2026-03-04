/**
 * Event submission handler for WebSocket submit_event frames.
 *
 * Handles all event types EXCEPT msg.relay (which has a separate handler).
 *
 * Flow:
 * 1. Verify Ed25519 signature via verifyEnvelope
 * 2. Data policy check via validatePayload
 * 3. Idempotency: return existing server_seq if event_id already stored
 * 3b. Pairing pre-validation (reject illegal ops before storing)
 * 4. Store event (DB assigns server_seq via BIGSERIAL)
 * 5. Apply side effects (agent upsert, pairing creation/transition)
 * 6. Return SubmitResultFrame
 *
 * Spec: tasks.md Task 7 sub-task 4 (7.2 event handler)
 */

import {
  verifyEnvelope,
  TRIAL_RULES,
  type EventEnvelope,
  type SubmitResultFrame,
} from "@agentverse/shared";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { AgentRepository } from "../../db/repositories/agent.repository.js";
import type { PairingRepository } from "../../db/repositories/pairing.repository.js";
import type { TrialsRepository } from "../../db/repositories/trials.repository.js";
import { validatePayload } from "./data-policy.js";

export interface EventHandlerDeps {
  eventRepo: EventRepository;
  agentRepo: AgentRepository;
  pairingRepo: PairingRepository;
  trialsRepo?: TrialsRepository;
}

export async function handleSubmitEvent(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
): Promise<SubmitResultFrame> {
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

  // 3. Idempotency: check if event_id already exists
  const existing = await deps.eventRepo.findByEventId(envelope.event_id);
  if (existing) {
    return {
      event_id: envelope.event_id,
      server_seq: String(existing.serverSeq),
      result_ts: now,
      status: "accepted",
    };
  }

  // 3b. Pairing pre-validation (before DB insert)
  const pairingError = await validatePairingOp(envelope, deps, now);
  if (pairingError) return pairingError;

  // 4. Store event (allocates server_seq)
  const event = await deps.eventRepo.insert({
    eventId: envelope.event_id,
    eventType: envelope.event_type,
    ts: new Date(envelope.ts),
    senderPubkey: envelope.sender_pubkey,
    recipientIds: envelope.recipient_ids,
    nonce: envelope.nonce,
    sig: envelope.sig,
    payload: envelope.payload as unknown as Record<string, unknown>,
  });

  // 5. Side effects based on event type
  await applyEventSideEffects(envelope, deps);

  return {
    event_id: envelope.event_id,
    server_seq: String(event.serverSeq),
    result_ts: now,
    status: "accepted",
  };
}

/**
 * Pre-validate pairing operations BEFORE the event is stored.
 * Returns a rejection SubmitResultFrame if validation fails, or null if OK.
 */
async function validatePairingOp(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
  now: string,
): Promise<SubmitResultFrame | null> {
  const payload = envelope.payload as unknown as Record<string, unknown>;

  switch (envelope.event_type) {
    case "pair.requested": {
      const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
      if (!senderAgent) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_sender_not_found", message: "Sender agent not registered" },
        };
      }
      const targetId = payload.target_agent_id as string;
      const dup = await deps.pairingRepo.hasPendingOrActive(senderAgent.id, targetId);
      if (dup) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_duplicate", message: "A pending or active pairing already exists" },
        };
      }
      break;
    }
    case "pair.approved": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (!pairing) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_not_found", message: "Pairing not found" },
        };
      }
      if (pairing.status !== "pending") {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: {
            code: "pair_invalid_transition",
            message: `Cannot approve pairing in '${pairing.status}' state`,
          },
        };
      }
      break;
    }
    case "pair.revoked": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (!pairing) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_not_found", message: "Pairing not found" },
        };
      }
      if (pairing.status === "revoked") {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: {
            code: "pair_invalid_transition",
            message: "Pairing is already revoked",
          },
        };
      }
      break;
    }
    case "trials.created": {
      // Verify sender agent exists
      const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
      if (!senderAgent) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "trial_sender_not_found", message: "Sender agent not registered" },
        };
      }
      // Verify pair_id exists and status=active
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (!pairing || pairing.status !== "active") {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "trial_pair_invalid", message: "Pairing not found or not active" },
        };
      }
      // Verify rule_id is valid
      const ruleId = payload.rule_id as string;
      if (!TRIAL_RULES.some((r) => r.id === ruleId)) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "trial_rule_invalid", message: `Unknown rule_id: ${ruleId}` },
        };
      }
      break;
    }
  }

  return null;
}

async function applyEventSideEffects(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
): Promise<void> {
  const payload = envelope.payload as unknown as Record<string, unknown>;

  switch (envelope.event_type) {
    case "agent.registered":
    case "agent.updated": {
      await deps.agentRepo.upsert({
        id: envelope.recipient_ids[0] ?? envelope.event_id,
        displayName: payload.display_name as string,
        personaTags: payload.persona_tags as string[],
        capabilities: payload.capabilities as Array<{ name: string; version: string }>,
        visibility: payload.visibility as "public" | "paired_only" | "private",
        pubkey: envelope.sender_pubkey,
        level: 1,
        badges: [],
      });
      break;
    }
    case "pair.requested": {
      // validatePairingOp already verified sender exists and no duplicate — create directly
      const senderAgent = (await deps.agentRepo.findByPubkey(envelope.sender_pubkey))!;
      const targetId = payload.target_agent_id as string;
      await deps.pairingRepo.create({
        agentAId: senderAgent.id,
        agentBId: targetId,
      });
      break;
    }
    case "pair.approved": {
      const pairId = payload.pair_id as string;
      await deps.pairingRepo.transitionStatus(pairId, "pending", "active");
      break;
    }
    case "pair.revoked": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (pairing && pairing.status !== "revoked") {
        await deps.pairingRepo.transitionStatus(pairId, pairing.status, "revoked");
      }
      break;
    }
    case "trials.created": {
      if (deps.trialsRepo) {
        const senderAgent = (await deps.agentRepo.findByPubkey(envelope.sender_pubkey))!;
        await deps.trialsRepo.createTrial({
          pairId: payload.pair_id as string,
          ruleId: payload.rule_id as string,
          rulePayload: (payload.rule_payload as Record<string, unknown>) ?? {},
          seed: payload.seed as string,
          createdBy: senderAgent.id,
        });
      }
      break;
    }
    // msg.relay side effects handled by msg-relay-handler, not here
  }
}

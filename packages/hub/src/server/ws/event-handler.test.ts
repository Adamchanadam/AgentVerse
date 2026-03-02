/**
 * Unit tests for handleSubmitEvent.
 *
 * Verifies:
 * 1. Accepts a valid agent.registered event and stores it
 * 2. Rejects an event with invalid signature
 * 3. Handles idempotent resubmission of same event_id
 * 4. Upserts agent record for agent.registered event
 * 5. Rejects event with data policy violation
 * 6. Rejects pair.requested when sender agent not registered
 * 7. Rejects pair.requested when pending/active pairing exists (pair_duplicate)
 * 8. Rejects pair.approved when pairing not found
 * 9. Rejects pair.approved when pairing is not pending (pair_invalid_transition)
 * 10. Rejects pair.revoked when pairing already revoked (pair_invalid_transition)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type AgentCardPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { pairings } from "../../db/schema.js";
import { handleSubmitEvent } from "./event-handler.js";
import type { Db } from "../../db/index.js";

// ─── Test Helpers ──────────────────────────────────────────

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

function makeSignedEnvelope(
  kp: { priv: string; pub: string },
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "agent.registered",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: {
      display_name: "TestBot",
      persona_tags: ["test"],
      capabilities: [{ name: "chat", version: "1.0" }],
      visibility: "public",
    } as AgentCardPayload,
    ...overrides,
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

function makePairRequestedEnvelope(
  kp: { priv: string; pub: string },
  targetAgentId: string,
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.requested",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [targetAgentId],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { target_agent_id: targetAgentId },
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

function makePairApprovedEnvelope(
  kp: { priv: string; pub: string },
  pairId: string,
  requesterId: string,
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.approved",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { pair_id: pairId, requester_agent_id: requesterId },
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

function makePairRevokedEnvelope(kp: { priv: string; pub: string }, pairId: string): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.revoked",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { pair_id: pairId },
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

// ─── Tests ─────────────────────────────────────────────────

describe("handleSubmitEvent", () => {
  let db: Db;
  let eventRepo: EventRepository;
  let agentRepo: AgentRepository;
  let pairingRepo: PairingRepository;

  beforeEach(() => {
    db = createTestDb();
    eventRepo = new EventRepository(db);
    agentRepo = new AgentRepository(db);
    pairingRepo = new PairingRepository(db);
  });

  it("accepts a valid agent.registered event and stores it", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeDefined();
    expect(result.event_id).toBe(envelope.event_id);
  });

  it("rejects an event with invalid signature", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    // Tamper with the signature
    envelope.sig = bytesToHex(randomBytes(64));
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("signature_invalid");
  });

  it("handles idempotent resubmission of same event_id", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    const first = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    const second = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(second.server_seq).toBe(first.server_seq);
  });

  it("upserts agent record for agent.registered event", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    const agent = await agentRepo.findByPubkey(kp.pub);
    expect(agent).not.toBeNull();
    expect(agent!.displayName).toBe("TestBot");
  });

  it("rejects event with data policy violation", async () => {
    const kp = makeKeypair();
    // Create envelope with an extra disallowed field (workspace_path)
    const envelope = makeSignedEnvelope(kp, {
      payload: {
        display_name: "TestBot",
        persona_tags: ["test"],
        capabilities: [{ name: "chat", version: "1.0" }],
        visibility: "public",
        workspace_path: "/home/secret",
      } as unknown as AgentCardPayload,
    });
    // Re-sign with the bad payload so signature is valid
    envelope.sig = signEnvelope(envelope, kp.priv);
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("data_policy_violation");
  });

  // ─── Pairing pre-validation tests ──────────────────────────

  it("rejects pair.requested when sender agent not registered", async () => {
    const kp = makeKeypair();
    const targetId = randomUUID();
    const envelope = makePairRequestedEnvelope(kp, targetId);
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("pair_sender_not_found");
  });

  it("rejects pair.requested when pending/active pairing exists (pair_duplicate)", async () => {
    // Register sender agent first
    const kpA = makeKeypair();
    const regA = makeSignedEnvelope(kpA);
    await handleSubmitEvent(regA, { eventRepo, agentRepo, pairingRepo });

    // Register target agent (needed for FK constraint on pairings.agent_b_id)
    const kpB = makeKeypair();
    const regB = makeSignedEnvelope(kpB);
    await handleSubmitEvent(regB, { eventRepo, agentRepo, pairingRepo });

    const targetAgent = await agentRepo.findByPubkey(kpB.pub);
    const targetId = targetAgent!.id;

    // First pair.requested should succeed
    const first = makePairRequestedEnvelope(kpA, targetId);
    const firstResult = await handleSubmitEvent(first, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(firstResult.status).toBe("accepted");

    // Second pair.requested for the same pair should be rejected
    const second = makePairRequestedEnvelope(kpA, targetId);
    const secondResult = await handleSubmitEvent(second, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(secondResult.status).toBe("rejected");
    expect(secondResult.error?.code).toBe("pair_duplicate");
  });

  it("rejects pair.approved when pairing not found", async () => {
    const kp = makeKeypair();
    const fakePairId = randomUUID();
    const envelope = makePairApprovedEnvelope(kp, fakePairId, randomUUID());
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("pair_not_found");
  });

  it("rejects pair.approved when pairing is not pending (pair_invalid_transition)", async () => {
    // Register sender
    const kpA = makeKeypair();
    const regA = makeSignedEnvelope(kpA);
    await handleSubmitEvent(regA, { eventRepo, agentRepo, pairingRepo });

    // Register target (needed as agentBId foreign key target)
    const kpB = makeKeypair();
    const regB = makeSignedEnvelope(kpB);
    await handleSubmitEvent(regB, { eventRepo, agentRepo, pairingRepo });

    // Get target agent ID
    const targetAgent = await agentRepo.findByPubkey(kpB.pub);
    const targetId = targetAgent!.id;

    // Create pairing via pair.requested
    const pairReq = makePairRequestedEnvelope(kpA, targetId);
    const reqResult = await handleSubmitEvent(pairReq, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(reqResult.status).toBe("accepted");

    // Get pairing ID from DB
    const rows = await db.select().from(pairings);
    const pairId = rows[0].id;

    // First approve should succeed
    const senderAgent = await agentRepo.findByPubkey(kpA.pub);
    const approve1 = makePairApprovedEnvelope(kpB, pairId, senderAgent!.id);
    const approve1Result = await handleSubmitEvent(approve1, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(approve1Result.status).toBe("accepted");

    // Second approve should fail — pairing is now 'active', not 'pending'
    const approve2 = makePairApprovedEnvelope(kpB, pairId, senderAgent!.id);
    const approve2Result = await handleSubmitEvent(approve2, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(approve2Result.status).toBe("rejected");
    expect(approve2Result.error?.code).toBe("pair_invalid_transition");
  });

  it("rejects pair.revoked when pairing already revoked (pair_invalid_transition)", async () => {
    // Register two agents
    const kpA = makeKeypair();
    const regA = makeSignedEnvelope(kpA);
    await handleSubmitEvent(regA, { eventRepo, agentRepo, pairingRepo });

    const kpB = makeKeypair();
    const regB = makeSignedEnvelope(kpB);
    await handleSubmitEvent(regB, { eventRepo, agentRepo, pairingRepo });

    const targetAgent = await agentRepo.findByPubkey(kpB.pub);
    const targetId = targetAgent!.id;

    // pair.requested
    const pairReq = makePairRequestedEnvelope(kpA, targetId);
    await handleSubmitEvent(pairReq, { eventRepo, agentRepo, pairingRepo });

    // Get pairing ID
    const rows = await db.select().from(pairings);
    const pairId = rows[0].id;

    // pair.approved
    const senderAgent = await agentRepo.findByPubkey(kpA.pub);
    const approve = makePairApprovedEnvelope(kpB, pairId, senderAgent!.id);
    await handleSubmitEvent(approve, { eventRepo, agentRepo, pairingRepo });

    // First pair.revoked should succeed
    const revoke1 = makePairRevokedEnvelope(kpA, pairId);
    const revoke1Result = await handleSubmitEvent(revoke1, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(revoke1Result.status).toBe("accepted");

    // Second pair.revoked should fail — already revoked
    const revoke2 = makePairRevokedEnvelope(kpA, pairId);
    const revoke2Result = await handleSubmitEvent(revoke2, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(revoke2Result.status).toBe("rejected");
    expect(revoke2Result.error?.code).toBe("pair_invalid_transition");
  });
});

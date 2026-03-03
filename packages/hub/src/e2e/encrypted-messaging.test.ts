/**
 * E2E test: Encrypted messaging — msg.relay round-trip with E2E encryption.
 *
 * Flow: Register + pair agents → encrypt message → submit msg.relay →
 *       recipient receives event → decrypt → verify plaintext.
 *
 * Spec: tasks.md 18.3
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { eq } from "drizzle-orm";
import {
  initSodium,
  generateX25519Keypair,
  encryptMessage,
  decryptMessage,
  type AadParts,
  type X25519Keypair,
} from "@agentverse/shared";
import {
  createE2EHub,
  connectAndAuth,
  registerAgent,
  createSignedEnvelope,
  submitAndWait,
  type E2EHub,
  type AuthenticatedAgent,
} from "./setup.js";
import { pairings } from "../db/schema.js";

describe("E2E: Encrypted messaging", () => {
  let hub: E2EHub;
  let agentA: AuthenticatedAgent;
  let agentB: AuthenticatedAgent;
  let pairId: string;
  let x25519B: X25519Keypair;

  beforeAll(async () => {
    await initSodium();
  });

  beforeEach(async () => {
    hub = await createE2EHub();
    agentA = await connectAndAuth(hub.port);
    agentB = await connectAndAuth(hub.port);
    await registerAgent(agentA, "Agent Alpha");
    await registerAgent(agentB, "Agent Beta");

    // Create active pairing: pair.requested → pair.approved
    const reqEnvelope = createSignedEnvelope(
      agentA.kp,
      "pair.requested",
      { target_agent_id: agentB.agentId, message: "pair up" },
      [agentB.agentId],
    );
    await submitAndWait(agentA, reqEnvelope);

    // Wait for Agent B to receive pair.requested
    await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.requested",
    );

    // Query DB for actual pair_id
    const [pairing] = await hub.app.db
      .select()
      .from(pairings)
      .where(eq(pairings.agentAId, agentA.agentId));
    pairId = pairing.id;

    // Approve pairing
    const approveEnvelope = createSignedEnvelope(
      agentB.kp,
      "pair.approved",
      { pair_id: pairId, requester_agent_id: agentA.agentId },
      [agentA.agentId],
    );
    await submitAndWait(agentB, approveEnvelope);

    // Wait for Agent A to receive pair.approved
    await agentA.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "pair.approved",
    );

    // Generate X25519 keypairs for E2E encryption
    // Generate X25519 keypairs for E2E encryption (A's keypair unused in current tests)
    generateX25519Keypair();
    x25519B = generateX25519Keypair();
  });

  afterEach(async () => {
    agentA.ws.close();
    agentB.ws.close();
    await hub.close();
  });

  it("sends encrypted msg.relay and recipient decrypts it", async () => {
    const plaintext = "Hello from Agent Alpha!";
    const eventId = crypto.randomUUID();

    const aadParts: AadParts = {
      event_id: eventId,
      pair_id: pairId,
      sender_pubkey: agentA.kp.publicKeyHex,
    };

    // Agent A encrypts message for Agent B
    const encrypted = encryptMessage(plaintext, x25519B.publicKey, aadParts);

    // Agent A sends msg.relay
    const relayEnvelope = createSignedEnvelope(
      agentA.kp,
      "msg.relay",
      {
        pair_id: pairId,
        ciphertext: bytesToHex(encrypted.ciphertext),
        ephemeral_pubkey: bytesToHex(encrypted.ephemeral_pubkey),
      },
      [agentB.agentId],
    );
    // Override event_id to match AAD
    relayEnvelope.event_id = eventId;
    // Re-sign with correct event_id
    const { signEnvelope } = await import("@agentverse/shared");
    relayEnvelope.sig = signEnvelope(relayEnvelope, agentA.kp.privateKeyHex);

    const result = await submitAndWait(agentA, relayEnvelope);
    expect(result.type).toBe("submit_result");
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("accepted");
    }

    // Agent B receives the msg.relay event
    const relayEvent = await agentB.collector.waitFor(
      (f) => f.type === "event" && f.payload.event_type === "msg.relay",
    );
    expect(relayEvent.type).toBe("event");

    if (relayEvent.type === "event") {
      const payload = relayEvent.payload.payload as unknown as Record<string, string>;
      // Reconstruct Uint8Array from hex for decryption
      const { hexToBytes } = await import("@noble/hashes/utils");
      const ct = hexToBytes(payload.ciphertext);
      const ekPub = hexToBytes(payload.ephemeral_pubkey);

      // Agent B decrypts
      const decrypted = decryptMessage(ct, ekPub, x25519B.privateKey, aadParts);
      expect(decrypted).toBe(plaintext);
    }
  });

  it("rejects msg.relay for non-active pairing", async () => {
    // Use a fake pair_id that doesn't exist
    const envelope = createSignedEnvelope(
      agentA.kp,
      "msg.relay",
      {
        pair_id: "00000000-0000-0000-0000-000000000000",
        ciphertext: "deadbeef",
        ephemeral_pubkey: "aabb".repeat(16),
      },
      [agentB.agentId],
    );
    const result = await submitAndWait(agentA, envelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("pair_not_active");
    }
  });

  it("rejects msg.relay from agent not in pairing", async () => {
    // Connect a third agent not part of the pairing
    const agentC = await connectAndAuth(hub.port);
    await registerAgent(agentC, "Agent Charlie");

    const envelope = createSignedEnvelope(
      agentC.kp,
      "msg.relay",
      {
        pair_id: pairId,
        ciphertext: "deadbeef",
        ephemeral_pubkey: "aabb".repeat(16),
      },
      [agentA.agentId],
    );
    const result = await submitAndWait(agentC, envelope);
    if (result.type === "submit_result") {
      expect(result.payload.status).toBe("rejected");
      expect(result.payload.error?.code).toBe("not_in_pairing");
    }

    agentC.ws.close();
  });
});

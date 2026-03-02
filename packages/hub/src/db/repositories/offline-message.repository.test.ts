/**
 * Unit tests for OfflineMessageRepository.
 * Verifies TTL offline store: insert, catchup query, expired cleanup.
 * Property 25: catchup only returns server_seq > afterSeq AND expires_at > NOW()
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { AgentRepository } from "./agent.repository.js";
import { PairingRepository } from "./pairing.repository.js";
import { EventRepository } from "./event.repository.js";
import { OfflineMessageRepository } from "./offline-message.repository.js";
import type { Db } from "../index.js";

let db: Db;
let agentRepo: AgentRepository;
let pairingRepo: PairingRepository;
let eventRepo: EventRepository;
let repo: OfflineMessageRepository;
let pairingId: string;
let senderPubkey: string;

beforeEach(async () => {
  db = createTestDb();
  agentRepo = new AgentRepository(db);
  pairingRepo = new PairingRepository(db);
  eventRepo = new EventRepository(db);
  repo = new OfflineMessageRepository(db);

  // Set up two agents + active pairing
  const a = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "A",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: "aaa" + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  });
  const b = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "B",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: "bbb" + randomUUID().replace(/-/g, ""),
    level: 1,
    badges: [],
  });
  senderPubkey = a.pubkey;
  const pairing = await pairingRepo.create({ agentAId: a.id, agentBId: b.id });
  await pairingRepo.transitionStatus(pairing.id, "pending", "active");
  pairingId = pairing.id;
});

async function insertEventAndMessage(ttlDays = 7) {
  // Insert event first (FK requirement)
  const event = await eventRepo.insert({
    eventId: randomUUID(),
    eventType: "msg.relay",
    ts: new Date(),
    senderPubkey,
    recipientIds: [],
    nonce: randomUUID().replace(/-/g, ""),
    sig: "f".repeat(128),
    payload: { pair_id: pairingId, ciphertext: "abc", ephemeral_pubkey: "xyz" },
  });
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const msg = await repo.insert({
    serverSeq: event.serverSeq,
    pairId: pairingId,
    senderPubkey,
    ciphertext: "base64ciphertext==",
    expiresAt,
  });
  return { event, msg };
}

describe("OfflineMessageRepository", () => {
  describe("insert", () => {
    it("stores a message and returns it with an id", async () => {
      const { msg } = await insertEventAndMessage();
      expect(msg.id).toBeTruthy();
      expect(msg.ciphertext).toBe("base64ciphertext==");
      expect(msg.pairId).toBe(pairingId);
    });
  });

  describe("findCatchup (Property 25)", () => {
    it("returns messages with server_seq > afterSeq and not expired", async () => {
      const { event: e1 } = await insertEventAndMessage(7);
      const { event: e2 } = await insertEventAndMessage(7);
      const { event: e3 } = await insertEventAndMessage(7);

      const results = await repo.findCatchup(e1.serverSeq, pairingId, 10);
      expect(results).toHaveLength(2);
      expect(results[0].serverSeq).toBe(e2.serverSeq);
      expect(results[1].serverSeq).toBe(e3.serverSeq);
    });

    it("excludes already-expired messages (Property 25)", async () => {
      // Insert an already-expired message
      const event = await eventRepo.insert({
        eventId: randomUUID(),
        eventType: "msg.relay",
        ts: new Date(),
        senderPubkey,
        recipientIds: [],
        nonce: randomUUID().replace(/-/g, ""),
        sig: "f".repeat(128),
        payload: {},
      });
      const expiredAt = new Date(Date.now() - 1000); // 1 second in the past
      await repo.insert({
        serverSeq: event.serverSeq,
        pairId: pairingId,
        senderPubkey,
        ciphertext: "expired==",
        expiresAt: expiredAt,
      });

      const results = await repo.findCatchup(0n, pairingId, 10);
      expect(results.every((m) => m.ciphertext !== "expired==")).toBe(true);
    });

    it("returns results in ascending server_seq order", async () => {
      await insertEventAndMessage(7);
      await insertEventAndMessage(7);
      await insertEventAndMessage(7);

      const results = await repo.findCatchup(0n, pairingId, 10);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].serverSeq).toBeGreaterThan(results[i - 1].serverSeq);
      }
    });
  });

  describe("deleteExpired", () => {
    it("deletes messages past their expires_at", async () => {
      const event = await eventRepo.insert({
        eventId: randomUUID(),
        eventType: "msg.relay",
        ts: new Date(),
        senderPubkey,
        recipientIds: [],
        nonce: randomUUID().replace(/-/g, ""),
        sig: "f".repeat(128),
        payload: {},
      });
      await repo.insert({
        serverSeq: event.serverSeq,
        pairId: pairingId,
        senderPubkey,
        ciphertext: "will-expire==",
        expiresAt: new Date(Date.now() - 1000),
      });

      const deletedCount = await repo.deleteExpired();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      const remaining = await repo.findCatchup(0n, pairingId, 10);
      expect(remaining.every((m) => m.ciphertext !== "will-expire==")).toBe(true);
    });

    it("returns 0 when no expired messages exist", async () => {
      await insertEventAndMessage(7); // not expired
      const count = await repo.deleteExpired();
      expect(count).toBe(0);
    });
  });
});

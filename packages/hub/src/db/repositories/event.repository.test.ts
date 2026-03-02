/**
 * Unit tests for EventRepository.
 * Verifies:
 * - insert returns event with assigned server_seq
 * - findRange returns events in server_seq order
 * - findByEventId returns event by UUID
 * - Append-only guard: no update/delete methods exposed
 *
 * Property 22: Events table is append-only (application layer enforcement)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createTestDb } from "../test-helpers/setup.js";
import { EventRepository } from "./event.repository.js";
import type { Db } from "../index.js";

let db: Db;
let repo: EventRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new EventRepository(db);
});

function makeEventData(
  overrides: Partial<{
    eventId: string;
    eventType: string;
    senderPubkey: string;
  }> = {},
) {
  return {
    eventId: overrides.eventId ?? randomUUID(),
    eventType: overrides.eventType ?? "agent.registered",
    ts: new Date(),
    senderPubkey: overrides.senderPubkey ?? "aabbcc" + randomUUID().replace(/-/g, ""),
    recipientIds: ["recipient-1"],
    nonce: randomUUID().replace(/-/g, ""),
    sig: "f".repeat(128),
    payload: {
      display_name: "TestAgent",
      persona_tags: [],
      capabilities: [],
      visibility: "public",
    },
  };
}

describe("EventRepository", () => {
  describe("insert", () => {
    it("inserts an event and returns it with a server_seq", async () => {
      const data = makeEventData();
      const event = await repo.insert(data);
      expect(event.eventId).toBe(data.eventId);
      expect(event.eventType).toBe("agent.registered");
      expect(typeof event.serverSeq).toBe("bigint");
      expect(event.serverSeq).toBeGreaterThan(0n);
    });

    it("assigns monotonically increasing server_seq", async () => {
      const e1 = await repo.insert(makeEventData());
      const e2 = await repo.insert(makeEventData());
      const e3 = await repo.insert(makeEventData());
      expect(e2.serverSeq).toBeGreaterThan(e1.serverSeq);
      expect(e3.serverSeq).toBeGreaterThan(e2.serverSeq);
    });

    it("rejects duplicate event_id (unique constraint)", async () => {
      const data = makeEventData();
      await repo.insert(data);
      await expect(repo.insert(data)).rejects.toThrow();
    });
  });

  describe("findByEventId", () => {
    it("returns event by event_id UUID", async () => {
      const data = makeEventData();
      await repo.insert(data);
      const found = await repo.findByEventId(data.eventId);
      expect(found?.eventId).toBe(data.eventId);
    });

    it("returns null for unknown event_id", async () => {
      const found = await repo.findByEventId(randomUUID());
      expect(found).toBeNull();
    });
  });

  describe("findRange", () => {
    it("returns events with server_seq > afterSeq in ascending order", async () => {
      const e1 = await repo.insert(makeEventData());
      const e2 = await repo.insert(makeEventData());
      const e3 = await repo.insert(makeEventData());

      const results = await repo.findRange(e1.serverSeq, 10);
      expect(results.length).toBe(2);
      expect(results[0].serverSeq).toBe(e2.serverSeq);
      expect(results[1].serverSeq).toBe(e3.serverSeq);
    });

    it("returns empty array when no events after afterSeq", async () => {
      const e1 = await repo.insert(makeEventData());
      const results = await repo.findRange(e1.serverSeq, 10);
      expect(results).toHaveLength(0);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) await repo.insert(makeEventData());
      const results = await repo.findRange(0n, 3);
      expect(results).toHaveLength(3);
    });
  });

  describe("append-only enforcement (Property 22)", () => {
    it("does not expose an update method", () => {
      expect((repo as unknown as Record<string, unknown>).update).toBeUndefined();
    });

    it("does not expose a delete method", () => {
      expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
      expect((repo as unknown as Record<string, unknown>).deleteById).toBeUndefined();
    });
  });
});

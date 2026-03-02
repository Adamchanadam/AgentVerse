/**
 * Unit tests for the catchup service.
 *
 * Verifies that getCatchupEvents correctly delegates to
 * EventRepository.findRange() and honours afterSeq / limit semantics.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { getCatchupEvents } from "./catchup-service.js";
import type { Db } from "../../db/index.js";
import type { Event } from "../../db/schema.js";

let db: Db;
let eventRepo: EventRepository;
let offlineMsgRepo: OfflineMessageRepository;

beforeEach(() => {
  db = createTestDb();
  eventRepo = new EventRepository(db);
  offlineMsgRepo = new OfflineMessageRepository(db);
});

/** Helper: inserts a single test event and returns it. */
function makeEvent(): Promise<Event> {
  return eventRepo.insert({
    eventId: randomUUID(),
    eventType: "agent.registered",
    ts: new Date(),
    senderPubkey: randomBytes(32).toString("hex"),
    recipientIds: [],
    nonce: randomBytes(16).toString("hex"),
    sig: randomBytes(64).toString("hex"),
    payload: {
      display_name: "Bot",
      persona_tags: [],
      capabilities: [],
      visibility: "public",
    },
  });
}

describe("getCatchupEvents", () => {
  it("returns events after the given server_seq", async () => {
    const e1 = await makeEvent();
    const e2 = await makeEvent();
    const e3 = await makeEvent();

    const results = await getCatchupEvents({
      afterSeq: e1.serverSeq,
      limit: 100,
      eventRepo,
      ttlDays: 7,
      offlineMsgRepo,
    });

    expect(results).toHaveLength(2);
    expect(results[0].serverSeq).toBe(e2.serverSeq);
    expect(results[1].serverSeq).toBe(e3.serverSeq);
  });

  it("returns events in ascending server_seq order", async () => {
    await makeEvent();
    await makeEvent();
    await makeEvent();

    const results = await getCatchupEvents({
      afterSeq: 0n,
      limit: 100,
      eventRepo,
      ttlDays: 7,
      offlineMsgRepo,
    });

    expect(results).toHaveLength(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].serverSeq).toBeGreaterThan(results[i - 1].serverSeq);
    }
  });

  it("returns empty array when no events after the given seq", async () => {
    const e1 = await makeEvent();

    const results = await getCatchupEvents({
      afterSeq: e1.serverSeq,
      limit: 100,
      eventRepo,
      ttlDays: 7,
      offlineMsgRepo,
    });

    expect(results).toHaveLength(0);
  });

  it("respects the limit parameter", async () => {
    await makeEvent();
    await makeEvent();
    await makeEvent();

    const results = await getCatchupEvents({
      afterSeq: 0n,
      limit: 2,
      eventRepo,
      ttlDays: 7,
      offlineMsgRepo,
    });

    expect(results).toHaveLength(2);
  });
});

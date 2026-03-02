import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { bytesToHex } from "@noble/hashes/utils";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { getCatchupEvents } from "./catchup-service.js";

describe("Property 25: msg.relay Catchup Semantics", () => {
  it("zero-persistence catchup excludes msg.relay (they are never stored)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (numMetadata) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const offlineMsgRepo = new OfflineMessageRepository(db);

        // Insert metadata events
        for (let i = 0; i < numMetadata; i++) {
          await eventRepo.insert({
            eventId: randomUUID(),
            eventType: "agent.registered",
            ts: new Date(),
            senderPubkey: bytesToHex(randomBytes(32)),
            recipientIds: [],
            nonce: bytesToHex(randomBytes(16)),
            sig: bytesToHex(randomBytes(64)),
            payload: {
              display_name: `Bot${i}`,
              persona_tags: [],
              capabilities: [],
              visibility: "public",
            },
          });
        }

        // Zero-persistence: no msg.relay events are stored, so catchup should
        // return only metadata events
        const results = await getCatchupEvents({
          afterSeq: 0n,
          limit: 1000,
          eventRepo,
          ttlDays: 0,
          offlineMsgRepo,
        });

        expect(results).toHaveLength(numMetadata);
        for (const e of results) {
          expect(e.eventType).not.toBe("msg.relay");
        }
      }),
      { numRuns: 10 },
    );
  });

  it("TTL mode catchup returns events in ascending server_seq order", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (numEvents) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const offlineMsgRepo = new OfflineMessageRepository(db);

        for (let i = 0; i < numEvents; i++) {
          await eventRepo.insert({
            eventId: randomUUID(),
            eventType: i % 2 === 0 ? "agent.registered" : "pair.requested",
            ts: new Date(),
            senderPubkey: bytesToHex(randomBytes(32)),
            recipientIds: [],
            nonce: bytesToHex(randomBytes(16)),
            sig: bytesToHex(randomBytes(64)),
            payload:
              i % 2 === 0
                ? {
                    display_name: `Bot${i}`,
                    persona_tags: [],
                    capabilities: [],
                    visibility: "public",
                  }
                : { target_agent_id: randomUUID() },
          });
        }

        const results = await getCatchupEvents({
          afterSeq: 0n,
          limit: 1000,
          eventRepo,
          ttlDays: 7,
          offlineMsgRepo,
        });

        // Strict ascending server_seq
        for (let i = 1; i < results.length; i++) {
          expect(results[i].serverSeq > results[i - 1].serverSeq).toBe(true);
        }
      }),
      { numRuns: 10 },
    );
  });
});

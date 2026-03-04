/**
 * Schema shape test — verifies all 8 tables are exported with correct column names.
 */
import { describe, it, expect } from "vitest";
import {
  owners,
  agents,
  pairings,
  events,
  genePacks,
  lineageEvents,
  trials,
  trialResults,
  agentStats,
  offlineMessages,
} from "./schema.js";

describe("drizzle schema exports", () => {
  it("owners has expected columns", () => {
    expect(owners.id).toBeDefined();
    expect(owners.handle).toBeDefined();
    expect(owners.pubkey).toBeDefined();
    expect(owners.createdAt).toBeDefined();
    expect(owners.updatedAt).toBeDefined();
  });

  it("agents has expected columns", () => {
    expect(agents.id).toBeDefined();
    expect(agents.ownerId).toBeDefined();
    expect(agents.displayName).toBeDefined();
    expect(agents.personaTags).toBeDefined();
    expect(agents.capabilities).toBeDefined();
    expect(agents.visibility).toBeDefined();
    expect(agents.pubkey).toBeDefined();
    expect(agents.level).toBeDefined();
    expect(agents.badges).toBeDefined();
    expect(agents.createdAt).toBeDefined();
    expect(agents.updatedAt).toBeDefined();
  });

  it("pairings has expected columns", () => {
    expect(pairings.id).toBeDefined();
    expect(pairings.agentAId).toBeDefined();
    expect(pairings.agentBId).toBeDefined();
    expect(pairings.status).toBeDefined();
    expect(pairings.createdAt).toBeDefined();
    expect(pairings.updatedAt).toBeDefined();
  });

  it("events has expected columns", () => {
    expect(events.serverSeq).toBeDefined();
    expect(events.eventId).toBeDefined();
    expect(events.eventType).toBeDefined();
    expect(events.ts).toBeDefined();
    expect(events.senderPubkey).toBeDefined();
    expect(events.recipientIds).toBeDefined();
    expect(events.nonce).toBeDefined();
    expect(events.sig).toBeDefined();
    expect(events.payload).toBeDefined();
    expect(events.receivedAt).toBeDefined();
  });

  it("genePacks has expected columns", () => {
    expect(genePacks.id).toBeDefined();
    expect(genePacks.ownerAgentId).toBeDefined();
    expect(genePacks.skillSlug).toBeDefined();
    expect(genePacks.state).toBeDefined();
  });

  it("lineageEvents has expected columns", () => {
    expect(lineageEvents.id).toBeDefined();
    expect(lineageEvents.parentGenepackA).toBeDefined();
    expect(lineageEvents.parentGenepackB).toBeDefined();
    expect(lineageEvents.childGenepack).toBeDefined();
  });

  it("trials has expected columns", () => {
    expect(trials.id).toBeDefined();
    expect(trials.pairId).toBeDefined();
    expect(trials.ruleId).toBeDefined();
    expect(trials.rulePayload).toBeDefined();
    expect(trials.seed).toBeDefined();
    expect(trials.status).toBeDefined();
    expect(trials.createdBy).toBeDefined();
    expect(trials.createdAt).toBeDefined();
    expect(trials.startedAt).toBeDefined();
    expect(trials.settledAt).toBeDefined();
  });

  it("trialResults has expected columns", () => {
    expect(trialResults.id).toBeDefined();
    expect(trialResults.trialId).toBeDefined();
    expect(trialResults.winnerAgentId).toBeDefined();
    expect(trialResults.loserAgentId).toBeDefined();
    expect(trialResults.ruleId).toBeDefined();
    expect(trialResults.triggerEventId).toBeDefined();
    expect(trialResults.transcriptDigest).toBeDefined();
    expect(trialResults.sigWinner).toBeDefined();
    expect(trialResults.sigLoser).toBeDefined();
    expect(trialResults.xpWinner).toBeDefined();
    expect(trialResults.xpLoser).toBeDefined();
  });

  it("agentStats has expected columns", () => {
    expect(agentStats.agentId).toBeDefined();
    expect(agentStats.wins).toBeDefined();
    expect(agentStats.losses).toBeDefined();
    expect(agentStats.xp).toBeDefined();
    expect(agentStats.updatedAt).toBeDefined();
  });

  it("offlineMessages has expected columns", () => {
    expect(offlineMessages.id).toBeDefined();
    expect(offlineMessages.serverSeq).toBeDefined();
    expect(offlineMessages.pairId).toBeDefined();
    expect(offlineMessages.senderPubkey).toBeDefined();
    expect(offlineMessages.ciphertext).toBeDefined();
    expect(offlineMessages.expiresAt).toBeDefined();
  });
});

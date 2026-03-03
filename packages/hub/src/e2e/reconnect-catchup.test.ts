/**
 * E2E test: Reconnect + catchup — agent disconnects, events arrive,
 * agent reconnects with last_seen_server_seq and receives missed events.
 *
 * Catchup replays events from the events table (not zero-persistence msg.relay).
 * Flow: Agent A registers → A disconnects → B submits events →
 *       A reconnects with last_seen_server_seq → receives catchup_start + events + catchup_end.
 *
 * Spec: tasks.md 18.4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createE2EHub, connectAndAuth, registerAgent, type E2EHub } from "./setup.js";

describe("E2E: Reconnect + catchup", () => {
  let hub: E2EHub;

  beforeEach(async () => {
    hub = await createE2EHub();
  });

  afterEach(async () => {
    await hub.close();
  });

  it("replays missed events on reconnect with last_seen_server_seq", async () => {
    // Agent A registers and notes its server_seq
    const agentA = await connectAndAuth(hub.port);
    const regResult = await registerAgent(agentA, "Agent Alpha");
    const lastSeqBeforeDisconnect = regResult; // server_seq from registration

    // Agent A disconnects
    agentA.ws.close();

    // Agent B registers while A is offline — this creates an event A will miss
    const agentB = await connectAndAuth(hub.port);
    await registerAgent(agentB, "Agent Beta");

    // Agent A reconnects with last_seen_server_seq
    const agentA2 = await connectAndAuth(hub.port, {
      kp: agentA.kp,
      lastSeenServerSeq: lastSeqBeforeDisconnect,
    });

    // A should receive catchup_start
    const catchupStart = await agentA2.collector.waitFor((f) => f.type === "catchup_start");
    expect(catchupStart.type).toBe("catchup_start");

    // A should receive catchup_end
    const catchupEnd = await agentA2.collector.waitFor((f) => f.type === "catchup_end");
    expect(catchupEnd.type).toBe("catchup_end");

    // Check that events were replayed between catchup_start and catchup_end
    const replayedEvents = agentA2.collector.frames.filter((f) => f.type === "event");
    expect(replayedEvents.length).toBeGreaterThanOrEqual(1);

    // At least one replayed event should be agent.registered (Agent B's registration)
    const agentBRegEvent = replayedEvents.find(
      (f) => f.type === "event" && f.payload.event_type === "agent.registered",
    );
    expect(agentBRegEvent).toBeTruthy();

    agentA2.ws.close();
    agentB.ws.close();
  });

  it("sends empty catchup when no events are missed", async () => {
    const agentA = await connectAndAuth(hub.port);
    const regResult = await registerAgent(agentA, "Agent Alpha");
    agentA.ws.close();

    // Reconnect with the same seq — nothing new happened
    const agentA2 = await connectAndAuth(hub.port, {
      kp: agentA.kp,
      lastSeenServerSeq: regResult,
    });

    const catchupStart = await agentA2.collector.waitFor((f) => f.type === "catchup_start");
    expect(catchupStart.type).toBe("catchup_start");

    const catchupEnd = await agentA2.collector.waitFor((f) => f.type === "catchup_end");
    expect(catchupEnd.type).toBe("catchup_end");

    // No events should be replayed
    const replayedEvents = agentA2.collector.frames.filter((f) => f.type === "event");
    expect(replayedEvents.length).toBe(0);

    agentA2.ws.close();
  });

  it("does not send catchup when last_seen_server_seq is omitted", async () => {
    const agentA = await connectAndAuth(hub.port);
    await registerAgent(agentA, "Agent Alpha");
    agentA.ws.close();

    // Reconnect WITHOUT last_seen_server_seq
    const agentA2 = await connectAndAuth(hub.port, { kp: agentA.kp });

    // Should get auth_ok but no catchup_start
    expect(agentA2.agentId).toBeTruthy();

    // Give a short window for any catchup frames to arrive
    await new Promise((resolve) => setTimeout(resolve, 100));

    const catchupFrames = agentA2.collector.frames.filter((f) => f.type === "catchup_start");
    expect(catchupFrames.length).toBe(0);

    agentA2.ws.close();
  });
});

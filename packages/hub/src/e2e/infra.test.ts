/**
 * E2E infrastructure verification — ensures test helpers work correctly.
 *
 * Spec: tasks.md 18.1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createE2EHub, connectAndAuth, registerAgent, type E2EHub } from "./setup.js";

describe("E2E infrastructure", () => {
  let hub: E2EHub;

  beforeEach(async () => {
    hub = await createE2EHub();
  });

  afterEach(async () => {
    await hub.close();
  });

  it("creates Hub and authenticates an agent", async () => {
    const agent = await connectAndAuth(hub.port);
    expect(agent.agentId).toBeTruthy();
    expect(agent.kp.publicKeyHex).toHaveLength(64);
    agent.ws.close();
  });

  it("registers an AgentCard and receives accepted result", async () => {
    const agent = await connectAndAuth(hub.port);
    const seq = await registerAgent(agent, "Infra Test Agent");
    expect(seq).toBeTruthy();
    expect(Number(seq)).toBeGreaterThan(0);
    agent.ws.close();
  });

  it("supports two simultaneous agent connections", async () => {
    const agentA = await connectAndAuth(hub.port);
    const agentB = await connectAndAuth(hub.port);
    expect(agentA.agentId).not.toBe(agentB.agentId);
    agentA.ws.close();
    agentB.ws.close();
  });
});

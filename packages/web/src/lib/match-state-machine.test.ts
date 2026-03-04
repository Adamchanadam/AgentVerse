import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MatchStateMachine, type MatchConfig, type MatchCallbacks } from "./match-state-machine.js";
import type { TrialRule, TrialsSettledPayload } from "@agentverse/shared";

const RULE: TrialRule = {
  id: "fw_hello",
  type: "forbidden_word",
  pattern: "hello",
  display_hint: "h____",
  difficulty: 1,
};

function createMachine(overrides?: Partial<MatchConfig>) {
  const callbacks: MatchCallbacks = {
    onStateChange: vi.fn(),
    onTurnTimeout: vi.fn(),
    onRuleTriggered: vi.fn(),
    onMatchResult: vi.fn(),
  };
  const config: MatchConfig = {
    turnTimerMs: 30_000,
    myAgentId: "agent-a",
    peerAgentId: "agent-b",
    pairId: "pair-1",
    ...overrides,
  };
  const machine = new MatchStateMachine(config, callbacks);
  return { machine, callbacks, config };
}

describe("MatchStateMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state is idle", () => {
    const { machine } = createMachine();
    expect(machine.state).toBe("idle");
  });

  it("challenge() transitions idle → challenge_sent", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    expect(machine.state).toBe("challenge_sent");
    expect(callbacks.onStateChange).toHaveBeenCalledWith("challenge_sent");
  });

  it("onTrialsStarted() transitions challenge_sent → in_progress", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    expect(machine.state).toBe("in_progress");
    expect(machine.trialId).toBe("trial-1");
    expect(machine.rule).toEqual(RULE);
    expect(machine.isMyTurn).toBe(true);
    expect(callbacks.onStateChange).toHaveBeenCalledWith("in_progress");
  });

  it("onMessageSent() increments turnCount and rotates turn", () => {
    const { machine } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    expect(machine.turnCount).toBe(0);
    machine.onMessageSent();
    expect(machine.turnCount).toBe(1);
    expect(machine.isMyTurn).toBe(false);
  });

  it("onMessageReceived() with triggering text → judging", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    machine.onMessageSent(); // my turn done
    const result = machine.onMessageReceived("hey hello there", "evt-1");
    expect(result?.triggered).toBe(true);
    expect(machine.state).toBe("judging");
    expect(callbacks.onRuleTriggered).toHaveBeenCalled();
  });

  it("onMessageReceived() with safe text → stays in_progress", () => {
    const { machine } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    machine.onMessageSent();
    const result = machine.onMessageReceived("hey there friend", "evt-2");
    expect(result?.triggered).toBe(false);
    expect(machine.state).toBe("in_progress");
  });

  it("turn timer fires → onTurnTimeout with forfeit agentId", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    // It's my turn, so I should forfeit on timeout
    vi.advanceTimersByTime(30_001);
    expect(callbacks.onTurnTimeout).toHaveBeenCalledWith("agent-a");
    expect(machine.state).toBe("judging");
  });

  it("onTrialsSettled() transitions to settled", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    const settled: TrialsSettledPayload = {
      trial_id: "trial-1",
      winner_agent_id: "agent-a",
      loser_agent_id: "agent-b",
      xp_winner: 100,
      xp_loser: 25,
    };
    machine.onTrialsSettled(settled);
    expect(machine.state).toBe("settled");
    expect(callbacks.onMatchResult).toHaveBeenCalledWith("agent-a", "agent-b", "settlement");
  });

  it("dispose() clears timers", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    machine.dispose();
    vi.advanceTimersByTime(60_000);
    expect(callbacks.onTurnTimeout).not.toHaveBeenCalled();
  });

  it("challenge() from non-idle state is no-op", () => {
    const { machine } = createMachine();
    machine.challenge();
    expect(machine.state).toBe("challenge_sent");
    machine.challenge(); // should be no-op
    expect(machine.state).toBe("challenge_sent");
  });

  it("onVerdictSent() transitions judging → reporting", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    machine.onMessageSent();
    machine.onMessageReceived("hey hello there", "evt-1"); // triggers judging
    expect(machine.state).toBe("judging");
    machine.onVerdictSent();
    expect(machine.state).toBe("reporting");
    expect(callbacks.onStateChange).toHaveBeenCalledWith("reporting");
  });

  it("onVerdictSent() from non-judging state is no-op", () => {
    const { machine } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    expect(machine.state).toBe("in_progress");
    machine.onVerdictSent(); // no-op
    expect(machine.state).toBe("in_progress");
  });

  it("peer turn timeout uses peerAgentId when not my turn", () => {
    const { machine, callbacks } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    machine.onMessageSent(); // now it's peer's turn
    expect(machine.isMyTurn).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(callbacks.onTurnTimeout).toHaveBeenCalledWith("agent-b");
  });

  it("onTrialsStarted() from idle state also transitions to in_progress", () => {
    const { machine } = createMachine();
    // No challenge() call — direct from idle
    machine.onTrialsStarted("trial-2", RULE, "agent-a");
    expect(machine.state).toBe("in_progress");
    expect(machine.trialId).toBe("trial-2");
  });

  it("onTrialsStarted() with peer as challenger sets isMyTurn=false", () => {
    const { machine } = createMachine();
    machine.onTrialsStarted("trial-3", RULE, "agent-b"); // peer is challenger
    expect(machine.state).toBe("in_progress");
    expect(machine.isMyTurn).toBe(false);
  });

  it("onMessageReceived() returns null when not in_progress", () => {
    const { machine } = createMachine();
    // machine is idle
    const result = machine.onMessageReceived("hello", "evt-3");
    expect(result).toBeNull();
  });

  it("turnCount increments on both sent and received messages", () => {
    const { machine } = createMachine();
    machine.challenge();
    machine.onTrialsStarted("trial-1", RULE, "agent-a");
    expect(machine.turnCount).toBe(0);
    machine.onMessageSent();
    expect(machine.turnCount).toBe(1);
    machine.onMessageReceived("safe text here", "evt-4"); // no trigger
    expect(machine.turnCount).toBe(2);
  });
});

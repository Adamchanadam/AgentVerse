import type { TrialRule, TrialsSettledPayload } from "@agentverse/shared";
import { evaluateRule, type RuleEvaluationResult } from "@agentverse/shared";

export type MatchState =
  | "idle"
  | "challenge_sent"
  | "in_progress"
  | "judging"
  | "reporting"
  | "settled";

export interface MatchConfig {
  turnTimerMs: number; // default 30_000
  myAgentId: string;
  peerAgentId: string;
  pairId: string;
}

export interface MatchCallbacks {
  onStateChange: (state: MatchState) => void;
  onTurnTimeout: (forfeitAgentId: string) => void;
  onRuleTriggered: (result: RuleEvaluationResult, triggerEventId: string) => void;
  onMatchResult: (winnerId: string, loserId: string, reason: string) => void;
}

export class MatchStateMachine {
  private _state: MatchState = "idle";
  private _turnTimer: ReturnType<typeof setTimeout> | null = null;
  private _trialId: string | null = null;
  private _rule: TrialRule | null = null;
  private _isMyTurn = false;
  private _turnCount = 0;

  constructor(
    private config: MatchConfig,
    private callbacks: MatchCallbacks,
  ) {}

  get state(): MatchState {
    return this._state;
  }
  get trialId(): string | null {
    return this._trialId;
  }
  get rule(): TrialRule | null {
    return this._rule;
  }
  get turnCount(): number {
    return this._turnCount;
  }
  get isMyTurn(): boolean {
    return this._isMyTurn;
  }

  /** User initiated challenge → idle→challenge_sent */
  challenge(): void {
    if (this._state !== "idle") return;
    this._setState("challenge_sent");
  }

  /** Hub sent trials.started → challenge_sent→in_progress */
  onTrialsStarted(trialId: string, rule: TrialRule, challengerAgentId: string): void {
    if (this._state !== "challenge_sent" && this._state !== "idle") return;
    this._trialId = trialId;
    this._rule = rule;
    this._isMyTurn = challengerAgentId === this.config.myAgentId;
    this._setState("in_progress");
    this._startTurnTimer();
  }

  /** After sending a message → rotate turn, reset timer */
  onMessageSent(): void {
    if (this._state !== "in_progress") return;
    this._turnCount++;
    this._isMyTurn = false;
    this._clearTurnTimer();
    this._startTurnTimer();
  }

  /** Received peer message plaintext → evaluate rule → maybe judging */
  onMessageReceived(plaintext: string, eventId: string): RuleEvaluationResult | null {
    if (this._state !== "in_progress" || !this._rule) return null;
    this._turnCount++;
    this._isMyTurn = true;
    this._clearTurnTimer();

    const result = evaluateRule(this._rule, plaintext);
    if (result.triggered) {
      this._setState("judging");
      this.callbacks.onRuleTriggered(result, eventId);
      return result;
    }

    this._startTurnTimer();
    return result;
  }

  /** Hub sent trials.settled → settled */
  onTrialsSettled(payload: TrialsSettledPayload): void {
    this._clearTurnTimer();
    this._setState("settled");
    this.callbacks.onMatchResult(payload.winner_agent_id, payload.loser_agent_id, "settlement");
  }

  /** Transition to reporting state (after verdict coordination) */
  onVerdictSent(): void {
    if (this._state !== "judging") return;
    this._setState("reporting");
  }

  /** Cleanup */
  dispose(): void {
    this._clearTurnTimer();
  }

  private _setState(s: MatchState): void {
    this._state = s;
    this.callbacks.onStateChange(s);
  }

  private _startTurnTimer(): void {
    this._clearTurnTimer();
    this._turnTimer = setTimeout(() => {
      // Current turn player forfeits
      const forfeitId = this._isMyTurn ? this.config.myAgentId : this.config.peerAgentId;
      this.callbacks.onTurnTimeout(forfeitId);
      this._setState("judging");
    }, this.config.turnTimerMs);
  }

  private _clearTurnTimer(): void {
    if (this._turnTimer !== null) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }
  }
}

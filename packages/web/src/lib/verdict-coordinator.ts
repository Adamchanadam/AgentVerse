import {
  signVerdict,
  verifyVerdictSignature,
  type Verdict,
  type SignedVerdict,
} from "@agentverse/shared";

export interface VerdictCoordinatorConfig {
  myPrivKeyHex: string;
  myPubKeyHex: string;
  peerPubKeyHex: string;
  myAgentId: string;
}

export class VerdictCoordinator {
  private _verdict: Verdict | null = null;
  private _mySig: string | null = null;
  private _peerSig: string | null = null;

  constructor(private config: VerdictCoordinatorConfig) {}

  /** Build verdict + sign with my key. Returns { verdict, sig } to send to peer. */
  buildAndSign(params: {
    matchId: string;
    winnerId: string;
    loserId: string;
    ruleId: string;
    triggerEventId: string;
    transcriptDigest: string;
  }): { verdict: Verdict; sig: string } {
    this._verdict = {
      match_id: params.matchId,
      winner_agent_id: params.winnerId,
      loser_agent_id: params.loserId,
      rule_id: params.ruleId,
      trigger_event_id: params.triggerEventId,
      transcript_digest: params.transcriptDigest,
    };
    this._mySig = signVerdict(this._verdict, this.config.myPrivKeyHex);
    return { verdict: this._verdict, sig: this._mySig };
  }

  /** Receive peer's sig, verify, attempt to assemble SignedVerdict. */
  receivePeerSig(verdict: Verdict, peerSig: string): SignedVerdict | null {
    if (!verifyVerdictSignature(verdict, peerSig, this.config.peerPubKeyHex)) {
      throw new Error("Peer verdict signature verification failed");
    }
    this._peerSig = peerSig;
    if (!this._verdict) this._verdict = verdict;
    return this._tryAssemble();
  }

  /** Get assembled SignedVerdict if both signatures are present. */
  getSignedVerdict(): SignedVerdict | null {
    return this._tryAssemble();
  }

  get isComplete(): boolean {
    return !!(this._mySig && this._peerSig);
  }

  private _tryAssemble(): SignedVerdict | null {
    if (!this._mySig || !this._peerSig || !this._verdict) return null;
    const iAmWinner = this._verdict.winner_agent_id === this.config.myAgentId;
    return {
      verdict: this._verdict,
      sig_winner: iAmWinner ? this._mySig : this._peerSig,
      sig_loser: iAmWinner ? this._peerSig : this._mySig,
    };
  }
}

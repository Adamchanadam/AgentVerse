import { describe, it, expect } from "vitest";
import { initDigest, appendDigest } from "./transcript-digest.js";

describe("initDigest", () => {
  it("produces a 64-char lowercase hex string", () => {
    const digest = initDigest("trial-abc-123");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same trial_id", () => {
    const d1 = initDigest("trial-xyz");
    const d2 = initDigest("trial-xyz");
    expect(d1).toBe(d2);
  });

  it("produces different output for different trial_ids", () => {
    const d1 = initDigest("trial-001");
    const d2 = initDigest("trial-002");
    expect(d1).not.toBe(d2);
  });
});

describe("appendDigest", () => {
  it("single message produces a 64-char hex string", () => {
    const prev = initDigest("trial-001");
    const result = appendDigest(prev, "event-id-1", "pubkey-aaa", "ciphertext-aaa");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("single message is deterministic with same inputs", () => {
    const prev = initDigest("trial-001");
    const r1 = appendDigest(prev, "event-id-1", "pubkey-aaa", "ciphertext-aaa");
    const r2 = appendDigest(prev, "event-id-1", "pubkey-aaa", "ciphertext-aaa");
    expect(r1).toBe(r2);
  });

  it("multi-message chain (init → append → append) is deterministic", () => {
    const buildChain = () => {
      const d0 = initDigest("trial-chain");
      const d1 = appendDigest(d0, "ev-1", "pk-alice", "ct-1");
      const d2 = appendDigest(d1, "ev-2", "pk-bob", "ct-2");
      return { d0, d1, d2 };
    };

    const run1 = buildChain();
    const run2 = buildChain();

    expect(run1.d0).toBe(run2.d0);
    expect(run1.d1).toBe(run2.d1);
    expect(run1.d2).toBe(run2.d2);
  });

  it("tampered event_id produces a different digest", () => {
    const prev = initDigest("trial-tamper");
    const honest = appendDigest(prev, "event-original", "pubkey-x", "ct-x");
    const tampered = appendDigest(prev, "event-TAMPERED", "pubkey-x", "ct-x");
    expect(honest).not.toBe(tampered);
  });

  it("cross-verify: two independent computations with same inputs yield the same result", () => {
    const trialId = "trial-cross-verify";
    const events = [
      { eventId: "ev-a", senderPubkey: "pk-1", ciphertext: "ct-hello" },
      { eventId: "ev-b", senderPubkey: "pk-2", ciphertext: "ct-world" },
      { eventId: "ev-c", senderPubkey: "pk-1", ciphertext: "ct-again" },
    ];

    // First computation
    let chain1 = initDigest(trialId);
    for (const ev of events) {
      chain1 = appendDigest(chain1, ev.eventId, ev.senderPubkey, ev.ciphertext);
    }

    // Second independent computation
    let chain2 = initDigest(trialId);
    for (const ev of events) {
      chain2 = appendDigest(chain2, ev.eventId, ev.senderPubkey, ev.ciphertext);
    }

    expect(chain1).toBe(chain2);
  });

  it("tampered sender_pubkey produces a different digest", () => {
    const prev = initDigest("trial-tamper-pk");
    const honest = appendDigest(prev, "ev-1", "pk-honest", "ct-y");
    const tampered = appendDigest(prev, "ev-1", "pk-ATTACKER", "ct-y");
    expect(honest).not.toBe(tampered);
  });

  it("tampered ciphertext produces a different digest", () => {
    const prev = initDigest("trial-tamper-ct");
    const honest = appendDigest(prev, "ev-2", "pk-z", "ct-original");
    const tampered = appendDigest(prev, "ev-2", "pk-z", "ct-MODIFIED");
    expect(honest).not.toBe(tampered);
  });
});

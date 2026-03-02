# Task 8: Hub 配對狀態機 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pairing pre-validation to event-handler.ts so that illegal state transitions and duplicate pairing requests are rejected BEFORE the event is stored, and write P14 + P15 property-based tests.

**Architecture:** The PairingRepository already enforces the state machine (`VALID_TRANSITIONS` map + `PairingTransitionError`), but `event-handler.ts` currently stores pairing events first, then applies side effects (which silently swallow duplicates and don't catch transition errors). We add a validation step BETWEEN the idempotency check (step 3) and the DB insert (step 4) that rejects invalid pairing operations with descriptive error codes. The msg-relay-handler already correctly rejects revoked pairings (`pair_not_active`).

**Tech Stack:** TypeScript, Vitest, fast-check, pg-mem (test DB), Drizzle ORM

---

### Task 1: Add pairing pre-validation to event-handler.ts

**Files:**

- Modify: `packages/hub/src/server/ws/event-handler.ts` (between step 3 idempotency and step 4 insert)

**Step 1: Read current event-handler.ts to confirm structure**

Confirm the file matches what we explored. The insertion point is between line 68 (end of idempotency check) and line 70 (start of `deps.eventRepo.insert`).

**Step 2: Add `validatePairingOp` function and call it before insert**

Add a new private function `validatePairingOp` that checks:

1. **`pair.requested`**: Look up sender agent by pubkey. If sender not found, reject with `pair_sender_not_found`. Then call `pairingRepo.hasPendingOrActive(senderId, targetId)` — if true, reject with `pair_duplicate`.
2. **`pair.approved`**: Look up pairing by `pair_id`. If not found, reject with `pair_not_found`. If `pairing.status !== "pending"`, reject with `pair_invalid_transition`.
3. **`pair.revoked`**: Look up pairing by `pair_id`. If not found, reject with `pair_not_found`. If `pairing.status === "revoked"`, reject with `pair_invalid_transition`.

The function returns `null` if validation passes, or a `SubmitResultFrame` (rejected) if it fails.

Insert the call at line 69 (after idempotency, before insert):

```typescript
// 3.5 Pairing pre-validation (reject illegal transitions before storing)
const pairingError = await validatePairingOp(envelope, deps);
if (pairingError) {
  return pairingError;
}
```

Full `validatePairingOp` implementation:

```typescript
async function validatePairingOp(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
): Promise<SubmitResultFrame | null> {
  const now = new Date().toISOString();
  const payload = envelope.payload as unknown as Record<string, unknown>;

  switch (envelope.event_type) {
    case "pair.requested": {
      const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
      if (!senderAgent) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_sender_not_found", message: "Sender agent not registered" },
        };
      }
      const targetId = payload.target_agent_id as string;
      const hasPending = await deps.pairingRepo.hasPendingOrActive(senderAgent.id, targetId);
      if (hasPending) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_duplicate", message: "A pending or active pairing already exists" },
        };
      }
      return null;
    }
    case "pair.approved": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (!pairing) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_not_found", message: "Pairing not found" },
        };
      }
      if (pairing.status !== "pending") {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: {
            code: "pair_invalid_transition",
            message: `Cannot approve pairing in '${pairing.status}' state`,
          },
        };
      }
      return null;
    }
    case "pair.revoked": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (!pairing) {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: { code: "pair_not_found", message: "Pairing not found" },
        };
      }
      if (pairing.status === "revoked") {
        return {
          event_id: envelope.event_id,
          result_ts: now,
          status: "rejected",
          error: {
            code: "pair_invalid_transition",
            message: "Pairing is already revoked",
          },
        };
      }
      return null;
    }
    default:
      return null;
  }
}
```

**Step 3: Simplify `applyEventSideEffects` for pair.requested**

Since `validatePairingOp` already checks `hasPendingOrActive` and sender existence, the `pair.requested` side effect no longer needs those guards. Simplify to just create:

```typescript
case "pair.requested": {
  const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
  // senderAgent guaranteed non-null — validatePairingOp already checked
  const targetId = payload.target_agent_id as string;
  await deps.pairingRepo.create({
    agentAId: senderAgent!.id,
    agentBId: targetId,
  });
  break;
}
```

**Step 4: Verify existing tests still pass**

Run: `cd packages/hub && pnpm vitest run src/server/ws/event-handler.test.ts`
Expected: All 5 existing tests PASS (no regressions)

**Step 5: Commit**

```bash
git add packages/hub/src/server/ws/event-handler.ts
git commit -m "feat(hub): add pairing pre-validation to event-handler

Reject pair.requested with pair_duplicate if pending/active exists.
Reject pair.approved/revoked with pair_invalid_transition on illegal state.
Reject pair_not_found / pair_sender_not_found for missing entities.
Validation runs before event is stored (between idempotency and insert)."
```

---

### Task 2: Add unit tests for pairing pre-validation error paths

**Files:**

- Modify: `packages/hub/src/server/ws/event-handler.test.ts`

**Step 1: Write failing tests for the new error paths**

Add the following tests to the existing `describe("handleSubmitEvent")` block. Each test needs a registered agent first (submit `agent.registered` event to populate DB), then tests the pairing error path.

Helper needed — add a `makePairRequestedEnvelope` function:

```typescript
function makePairRequestedEnvelope(
  kp: { priv: string; pub: string },
  targetAgentId: string,
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.requested",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [targetAgentId],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: {
      target_agent_id: targetAgentId,
    },
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}
```

Tests to add:

```typescript
it("rejects pair.requested when sender agent not registered", async () => {
  const kp = makeKeypair();
  const envelope = makePairRequestedEnvelope(kp, "some-target-id");
  const result = await handleSubmitEvent(envelope, { eventRepo, agentRepo, pairingRepo });
  expect(result.status).toBe("rejected");
  expect(result.error?.code).toBe("pair_sender_not_found");
});

it("rejects pair.requested when pending/active pairing exists (pair_duplicate)", async () => {
  const kp = makeKeypair();
  // Register sender agent first
  const regEnvelope = makeSignedEnvelope(kp);
  await handleSubmitEvent(regEnvelope, { eventRepo, agentRepo, pairingRepo });
  const targetId = randomUUID();
  // First pair request — should succeed
  const req1 = makePairRequestedEnvelope(kp, targetId);
  const result1 = await handleSubmitEvent(req1, { eventRepo, agentRepo, pairingRepo });
  expect(result1.status).toBe("accepted");
  // Second pair request — should be rejected as duplicate
  const req2 = makePairRequestedEnvelope(kp, targetId);
  const result2 = await handleSubmitEvent(req2, { eventRepo, agentRepo, pairingRepo });
  expect(result2.status).toBe("rejected");
  expect(result2.error?.code).toBe("pair_duplicate");
});

it("rejects pair.approved when pairing not found", async () => {
  const kp = makeKeypair();
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.approved",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { pair_id: randomUUID(), requester_agent_id: randomUUID() },
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  const result = await handleSubmitEvent(envelope, { eventRepo, agentRepo, pairingRepo });
  expect(result.status).toBe("rejected");
  expect(result.error?.code).toBe("pair_not_found");
});

it("rejects pair.approved when pairing is not pending (pair_invalid_transition)", async () => {
  const kpA = makeKeypair();
  const kpB = makeKeypair();
  // Register both agents
  await handleSubmitEvent(makeSignedEnvelope(kpA), { eventRepo, agentRepo, pairingRepo });
  await handleSubmitEvent(makeSignedEnvelope(kpB), { eventRepo, agentRepo, pairingRepo });
  const agentB = await agentRepo.findByPubkey(kpB.pub);
  // Create a pairing: A requests B
  const pairReq = makePairRequestedEnvelope(kpA, agentB!.id);
  await handleSubmitEvent(pairReq, { eventRepo, agentRepo, pairingRepo });
  // Find the pairing, approve it
  const agentA = await agentRepo.findByPubkey(kpA.pub);
  const pairing = await pairingRepo.hasPendingOrActive(agentA!.id, agentB!.id);
  // Get the actual pairing record to get ID
  // Use findActiveByAgents won't work (still pending), use DB query via pairingRepo
  // We need to get the pairing ID — look up by agents
  const pairings = await db.select().from(require("../../db/schema.js").pairings);
  const pairingRow = pairings[0];
  // Approve it first
  const approveEnv: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.approved",
    ts: new Date().toISOString(),
    sender_pubkey: kpB.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { pair_id: pairingRow.id, requester_agent_id: agentA!.id },
  };
  approveEnv.sig = signEnvelope(approveEnv, kpB.priv);
  const approveResult = await handleSubmitEvent(approveEnv, { eventRepo, agentRepo, pairingRepo });
  expect(approveResult.status).toBe("accepted");
  // Try to approve again — should fail with pair_invalid_transition
  const reapproveEnv: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "pair.approved",
    ts: new Date().toISOString(),
    sender_pubkey: kpB.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: { pair_id: pairingRow.id, requester_agent_id: agentA!.id },
  };
  reapproveEnv.sig = signEnvelope(reapproveEnv, kpB.priv);
  const result = await handleSubmitEvent(reapproveEnv, { eventRepo, agentRepo, pairingRepo });
  expect(result.status).toBe("rejected");
  expect(result.error?.code).toBe("pair_invalid_transition");
});

it("rejects pair.revoked when pairing already revoked (pair_invalid_transition)", async () => {
  // Similar setup: register agents, create pairing, approve, revoke, try revoke again
  // ... (full code provided in implementation)
});
```

**Step 2: Run tests to verify they fail (pre-implementation) or pass (post-Task-1)**

Run: `cd packages/hub && pnpm vitest run src/server/ws/event-handler.test.ts`
Expected: All new tests PASS (since Task 1 already added the validation)

**Step 3: Verify no regressions**

Run: `cd packages/hub && pnpm vitest run`
Expected: All hub tests PASS

**Step 4: Commit**

```bash
git add packages/hub/src/server/ws/event-handler.test.ts
git commit -m "test(hub): add unit tests for pairing pre-validation error paths

Tests cover: pair_sender_not_found, pair_duplicate, pair_not_found,
pair_invalid_transition (approve non-pending), pair_invalid_transition
(revoke already-revoked)."
```

---

### Task 3: P14 Property-Based Test — Pairing State Machine Legality

**Files:**

- Create: `packages/hub/src/server/ws/pairing-state-machine.pbt.test.ts`

**Step 1: Write the P14 PBT**

Strategy: Use fast-check to generate random sequences of pairing operations (requested, approved, revoked) and verify that:

1. Legal transitions always succeed
2. Illegal transitions are always rejected with `pair_invalid_transition`
3. The pairing status after a sequence of operations matches the expected state machine

The test sets up two registered agents, then applies a random sequence of pair operations via `handleSubmitEvent`, tracking expected state and verifying each result.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type AgentCardPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { handleSubmitEvent, type EventHandlerDeps } from "./event-handler.js";
import type { Db } from "../../db/index.js";

// Helpers: makeKeypair, makeSignedEnvelope, registerAgent, submitPairOp
// (full implementations in code)

type PairOp = "requested" | "approved" | "revoked";

// Valid transitions from each state
const LEGAL: Record<string, PairOp[]> = {
  none: ["requested"],
  pending: ["approved", "revoked"],
  active: ["revoked"],
  revoked: [],
};

describe("P14: Pairing state machine legality", () => {
  it("only legal transitions succeed; illegal transitions rejected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("requested", "approved", "revoked"), {
          minLength: 1,
          maxLength: 8,
        }),
        async (ops: PairOp[]) => {
          const db = createTestDb();
          const deps = makeDeps(db);
          const kpA = makeKeypair();
          const kpB = makeKeypair();
          // Register both agents
          await registerAgent(kpA, deps);
          await registerAgent(kpB, deps);
          const agentA = await deps.agentRepo.findByPubkey(kpA.pub);
          const agentB = await deps.agentRepo.findByPubkey(kpB.pub);

          let state = "none"; // none | pending | active | revoked
          let pairId: string | null = null;

          for (const op of ops) {
            const legal = LEGAL[state].includes(op);
            const result = await submitPairOp(op, kpA, kpB, agentA!, agentB!, pairId, deps);

            if (legal) {
              expect(result.status).toBe("accepted");
              // Update state
              if (op === "requested") {
                state = "pending"; /* extract pairId from DB */
              }
              if (op === "approved") state = "active";
              if (op === "revoked") state = "revoked";
              // Get pairId after first request
              if (op === "requested" && !pairId) {
                // Find pairing in DB
                // ... (implementation detail)
              }
            } else {
              expect(result.status).toBe("rejected");
              // State unchanged
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd packages/hub && pnpm vitest run src/server/ws/pairing-state-machine.pbt.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/hub/src/server/ws/pairing-state-machine.pbt.test.ts
git commit -m "test(hub): P14 — pairing state machine legality PBT

Random sequences of pair ops verify only legal transitions succeed
and illegal transitions return pair_invalid_transition/pair_duplicate."
```

---

### Task 4: P15 Property-Based Test — Revoked Stops msg.relay

**Files:**

- Create: `packages/hub/src/server/ws/pairing-revoked-relay.pbt.test.ts`

**Step 1: Write the P15 PBT**

Strategy: Create a pairing (requested → approved), then revoke it, then attempt msg.relay via `handleMsgRelay`. The relay MUST be rejected with `pair_not_active`.

Use fast-check to generate random ciphertext payloads and verify the invariant holds.

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
// ... imports ...
import { handleMsgRelay, type MsgRelayDeps } from "./msg-relay-handler.js";

describe("P15: Revoked pairing stops msg.relay", () => {
  it("msg.relay is always rejected after revocation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 200 }), // random ciphertext
        async (ciphertext: string) => {
          const db = createTestDb();
          // Setup: register agents, create pairing, approve, revoke
          // ...
          // Attempt msg.relay on revoked pairing
          const relayResult = await handleMsgRelay(relayEnvelope, relayDeps);
          expect(relayResult.status).toBe("rejected");
          expect(relayResult.error?.code).toBe("pair_not_active");
        },
      ),
      { numRuns: 30 },
    );
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd packages/hub && pnpm vitest run src/server/ws/pairing-revoked-relay.pbt.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/hub/src/server/ws/pairing-revoked-relay.pbt.test.ts
git commit -m "test(hub): P15 — revoked pairing stops msg.relay PBT

Random ciphertext payloads verify msg.relay is always rejected with
pair_not_active after pairing revocation."
```

---

### Task 5: Full regression + update tasks.md + session files

**Files:**

- Modify: `.kiro/specs/agentverse/tasks.md` (mark 8.1, 8.2, 8.3 as [x])
- Modify: `dev/SESSION_HANDOFF.md`
- Modify: `dev/SESSION_LOG.md`

**Step 1: Run full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

Expected: All checks pass, total test count = 208 + new tests (estimate ~215-220)

**Step 2: Mark tasks complete in tasks.md**

Change:

```
- [ ] 8. 實作 Hub 配對狀態機（`packages/hub`）
  - [ ] 8.1 實作配對狀態機邏輯
  - [ ] 8.2 撰寫配對狀態機合法性屬性測試（MVP 必做）
  - [ ] 8.3 撰寫撤銷後停止訊息轉送屬性測試（MVP 必做）
```

To:

```
- [x] 8. 實作 Hub 配對狀態機（`packages/hub`）
  - [x] 8.1 實作配對狀態機邏輯
  - [x] 8.2 撰寫配對狀態機合法性屬性測試（MVP 必做）
  - [x] 8.3 撰寫撤銷後停止訊息轉送屬性測試（MVP 必做）
```

**Step 3: Update session files**

- `SESSION_HANDOFF.md`: Update current task to Task 9 (Checkpoint), update test count
- `SESSION_LOG.md`: Add session entry for Task 8 completion

**Step 4: Commit**

```bash
git add .kiro/specs/agentverse/tasks.md dev/SESSION_HANDOFF.md dev/SESSION_LOG.md
git commit -m "docs: mark Task 8 complete, update session files

Task 8 — Hub pairing state machine: pre-validation + P14/P15 PBTs.
All regression checks pass."
```

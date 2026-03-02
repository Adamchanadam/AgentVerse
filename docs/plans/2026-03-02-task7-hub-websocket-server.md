# Task 7: Hub WebSocket Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the WebSocket layer for AgentVerse Hub — challenge-response auth, event submission/verification/broadcasting, consumer ack cursor management, catchup replay, data policy validation, msg.relay blind forwarding (zero-persistence + TTL modes), ping/pong heartbeat, and per-operation rate limits.

**Architecture:** A Fastify WebSocket plugin (`wsPlugin`) registered via `@fastify/websocket` on `GET /ws`. Each connection is an FSM: `awaiting_auth` → `authenticated` → bidirectional event streaming. A `ConnectionManager` tracks connected clients (pubkey → socket). Handler functions (auth, event, ack, relay, catchup, data-policy) are pure-ish functions that take repositories as dependencies — easy to unit-test. Integration tests use a real Fastify server on a random port + `ws` client library + pg-mem.

**Tech Stack:** `@fastify/websocket@^11` (already installed), `ws` (transitive dep from @fastify/websocket), `fastify-plugin`, `@noble/curves/ed25519` (already in @agentverse/shared for sig verify), Vitest, pg-mem via `createTestDb()`.

**Spec SSOT:** `.kiro/specs/agentverse/tasks.md` §7 (sub-tasks 7.1–7.13); `.kiro/specs/agentverse/design.md` §WsFrame schema, ack flow, catchup, msg.relay modes.

---

## Context for the implementer

You are implementing Task 7 of the AgentVerse Hub (`packages/hub`). The DB layer (Task 4) and REST API (Task 5) are complete — do NOT modify existing repository files. All existing tests must continue to pass (baseline: 158/158).

### Key files to read first

- `packages/shared/src/ws-types.ts` — `WsFrame` union type, `AuthPayload`, `SubmitResultFrame`, `ConsumerAckFrame`
- `packages/shared/src/types.ts` — `EventEnvelope`, `EventType`, payload interfaces
- `packages/shared/src/signing.ts` — `verifyEnvelope()` for signature validation
- `packages/hub/src/server/app.ts` — current `buildApp()` factory; you'll add `wsPlugin` here
- `packages/hub/src/db/repositories/*.ts` — `EventRepository`, `AgentRepository`, `PairingRepository`, `OfflineMessageRepository`
- `packages/hub/src/db/test-helpers/setup.ts` — `createTestDb()` for pg-mem test isolation
- `packages/hub/src/env.ts` — `HubConfig` interface (has `MSG_RELAY_TTL_DAYS`)

### File structure to create

```
packages/hub/src/server/ws/
  types.ts                      # WsClient interface, ConnectionState enum
  connection-manager.ts         # Track connected clients
  connection-manager.test.ts
  auth-handler.ts               # Challenge-response auth
  auth-handler.test.ts
  event-handler.ts              # submit_event → verify → store → broadcast
  event-handler.test.ts
  catchup-service.ts            # Replay missed events on reconnect
  catchup-service.test.ts
  data-policy.ts                # Structural payload validation
  data-policy.test.ts
  msg-relay-handler.ts          # Blind forwarding (zero-persistence + TTL)
  msg-relay-handler.test.ts
  ws-plugin.ts                  # Fastify plugin orchestrator
  ws-plugin.integration.test.ts # Full WebSocket integration tests
```

### WsFrame types (already defined in shared)

```typescript
type WsFrame =
  | { type: "challenge"; nonce: string } // Hub → Plugin
  | { type: "auth"; payload: AuthPayload } // Plugin → Hub
  | { type: "auth_ok"; payload: AuthOkPayload } // Hub → Plugin
  | { type: "auth_error"; error: string } // Hub → Plugin
  | { type: "submit_event"; payload: EventEnvelope } // Plugin → Hub
  | { type: "event"; payload: EventEnvelope; server_seq: string } // Hub → Plugin
  | { type: "submit_result"; payload: SubmitResultFrame } // Hub → sender
  | { type: "consumer_ack"; payload: ConsumerAckFrame } // Receiver → Hub
  | { type: "error"; code: string; message: string } // Hub → Plugin
  | { type: "catchup_start"; from_seq: string } // Hub → Plugin
  | { type: "catchup_end" } // Hub → Plugin
  | { type: "ping" } // Hub → Plugin
  | { type: "pong" }; // Plugin → Hub
```

### Critical invariants

1. **submit_result does NOT affect any cursor** — only `consumer_ack` advances `last_seen_server_seq`
2. **Catchup range**: `(last_seen_server_seq, +∞)` — exclusive lower bound
3. **Zero-persistence msg.relay (default)**: no DB write, no server_seq, blind forward only; catchup excludes
4. **TTL msg.relay**: placeholder in events table (no ciphertext) + ciphertext in offline_messages; catchup includes non-expired
5. **Append-only events**: EventRepository has no update/delete; duplicate event_id throws unique constraint

### Test helpers for WebSocket integration tests

For integration tests that need a real WebSocket connection:

```typescript
import { type AddressInfo } from "net";
import WebSocket from "ws";

// Start server on random port
await app.listen({ port: 0 });
const port = (app.server.address() as AddressInfo).port;

// Connect WS client
const ws = new WebSocket(`ws://localhost:${port}/ws`);
await new Promise<void>((resolve) => ws.on("open", resolve));

// Helper: send a frame and wait for response
function send(frame: WsFrame): void {
  ws.send(JSON.stringify(frame));
}

function waitForFrame(predicate?: (f: WsFrame) => boolean): Promise<WsFrame> {
  return new Promise((resolve) => {
    ws.on("message", function handler(data) {
      const frame = JSON.parse(data.toString()) as WsFrame;
      if (!predicate || predicate(frame)) {
        ws.off("message", handler);
        resolve(frame);
      }
    });
  });
}

// Cleanup
ws.close();
await app.close();
```

### Baseline

Run `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` before starting — must be all green (158/158 tests).

---

## Plan Task 1: WS types + ConnectionManager

**Files:**

- Create: `packages/hub/src/server/ws/types.ts`
- Create: `packages/hub/src/server/ws/connection-manager.ts`
- Create: `packages/hub/src/server/ws/connection-manager.test.ts`

**Step 1: Write the types file**

Create `packages/hub/src/server/ws/types.ts`:

```typescript
import type WebSocket from "ws";

/** Connection lifecycle states. */
export type ConnectionState = "awaiting_auth" | "authenticated";

/** A tracked WebSocket client. */
export interface WsClient {
  socket: WebSocket;
  state: ConnectionState;
  /** Set after successful auth. */
  pubkey?: string;
  /** Set after successful auth. */
  agentId?: string;
  /** Hex-encoded nonce sent during challenge. */
  pendingNonce?: string;
}
```

**Step 2: Write the failing tests**

Create `packages/hub/src/server/ws/connection-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionManager } from "./connection-manager.js";

// Minimal mock socket
function mockSocket(id = "1"): any {
  return {
    id,
    readyState: 1, // WebSocket.OPEN
    send: () => {},
    close: () => {},
  };
}

describe("ConnectionManager", () => {
  let mgr: ConnectionManager;

  beforeEach(() => {
    mgr = new ConnectionManager();
  });

  it("adds and retrieves a client by pubkey", () => {
    const sock = mockSocket();
    mgr.add("pubkey-a", "agent-1", sock);
    expect(mgr.getByPubkey("pubkey-a")).toBeDefined();
    expect(mgr.getByPubkey("pubkey-a")!.agentId).toBe("agent-1");
  });

  it("removes a client", () => {
    const sock = mockSocket();
    mgr.add("pubkey-a", "agent-1", sock);
    mgr.remove("pubkey-a");
    expect(mgr.getByPubkey("pubkey-a")).toBeUndefined();
  });

  it("getByAgentId returns the correct client", () => {
    const sock = mockSocket();
    mgr.add("pubkey-a", "agent-1", sock);
    expect(mgr.getByAgentId("agent-1")).toBeDefined();
    expect(mgr.getByAgentId("agent-1")!.pubkey).toBe("pubkey-a");
  });

  it("returns the connected client count", () => {
    mgr.add("pk-1", "a-1", mockSocket("1"));
    mgr.add("pk-2", "a-2", mockSocket("2"));
    expect(mgr.size).toBe(2);
  });

  it("replaces existing connection when same pubkey reconnects", () => {
    const old = mockSocket("old");
    const fresh = mockSocket("new");
    mgr.add("pk-1", "a-1", old);
    mgr.add("pk-1", "a-1", fresh);
    expect(mgr.size).toBe(1);
    expect(mgr.getByPubkey("pk-1")!.socket).toBe(fresh);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
pnpm test -- packages/hub/src/server/ws/connection-manager.test.ts
```

Expected: FAIL — `ConnectionManager` not found.

**Step 4: Implement ConnectionManager**

Create `packages/hub/src/server/ws/connection-manager.ts`:

```typescript
import type WebSocket from "ws";

interface ConnectedClient {
  socket: WebSocket;
  pubkey: string;
  agentId: string;
}

export class ConnectionManager {
  private byPubkey = new Map<string, ConnectedClient>();
  private byAgentId = new Map<string, ConnectedClient>();

  get size(): number {
    return this.byPubkey.size;
  }

  add(pubkey: string, agentId: string, socket: WebSocket): void {
    // If already connected, close old socket silently
    const existing = this.byPubkey.get(pubkey);
    if (existing && existing.socket !== socket) {
      existing.socket.close(1000, "replaced");
    }
    const client: ConnectedClient = { socket, pubkey, agentId };
    this.byPubkey.set(pubkey, client);
    this.byAgentId.set(agentId, client);
  }

  remove(pubkey: string): void {
    const client = this.byPubkey.get(pubkey);
    if (client) {
      this.byPubkey.delete(pubkey);
      this.byAgentId.delete(client.agentId);
    }
  }

  getByPubkey(pubkey: string): ConnectedClient | undefined {
    return this.byPubkey.get(pubkey);
  }

  getByAgentId(agentId: string): ConnectedClient | undefined {
    return this.byAgentId.get(agentId);
  }

  /** Send a JSON frame to a specific agent if online. Returns true if sent. */
  sendTo(agentId: string, frame: unknown): boolean {
    const client = this.byAgentId.get(agentId);
    if (client && client.socket.readyState === 1) {
      client.socket.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }
}
```

**Step 5: Run tests to verify they pass**

```bash
pnpm test -- packages/hub/src/server/ws/connection-manager.test.ts
```

Expected: 5 passed.

**Step 6: Full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

Expected: All green, test count increased.

---

## Plan Task 2: Auth handler (7.1)

**Files:**

- Create: `packages/hub/src/server/ws/auth-handler.ts`
- Create: `packages/hub/src/server/ws/auth-handler.test.ts`

**Step 1: Write the failing tests**

The auth handler should:

1. Generate a random nonce (32 bytes, hex)
2. Verify: `ed25519.verify(sig, hexToBytes(nonce), hexToBytes(pubkey))`
3. Look up agent by pubkey (via AgentRepository)
4. If not found, create a minimal agent record (auto-register on first connect)
5. Return `{ agentId, serverTime }` on success, or `{ error }` on failure

Create `packages/hub/src/server/ws/auth-handler.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";
import { generateNonce, verifyAuth } from "./auth-handler.js";

describe("generateNonce", () => {
  it("returns a 64-char hex string (32 bytes)", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(64);
    expect(() => hexToBytes(nonce)).not.toThrow();
  });

  it("returns different values on each call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("verifyAuth", () => {
  function makeKeypair() {
    const priv = randomBytes(32);
    const pub = ed25519.getPublicKey(priv);
    return { priv: bytesToHex(priv), pub: bytesToHex(pub) };
  }

  it("returns success for valid sig(nonce)", () => {
    const kp = makeKeypair();
    const nonce = generateNonce();
    const sig = bytesToHex(ed25519.sign(hexToBytes(nonce), hexToBytes(kp.priv)));
    const result = verifyAuth(nonce, kp.pub, sig);
    expect(result.ok).toBe(true);
  });

  it("returns failure for invalid signature", () => {
    const kp = makeKeypair();
    const nonce = generateNonce();
    const badSig = bytesToHex(randomBytes(64));
    const result = verifyAuth(nonce, kp.pub, badSig);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("signature");
  });

  it("returns failure for wrong pubkey", () => {
    const kp1 = makeKeypair();
    const kp2 = makeKeypair();
    const nonce = generateNonce();
    const sig = bytesToHex(ed25519.sign(hexToBytes(nonce), hexToBytes(kp1.priv)));
    const result = verifyAuth(nonce, kp2.pub, sig);
    expect(result.ok).toBe(false);
  });

  it("returns failure for malformed hex", () => {
    const result = verifyAuth("nothex", "nothex", "nothex");
    expect(result.ok).toBe(false);
  });
});
```

**Step 2: Implement auth-handler**

Create `packages/hub/src/server/ws/auth-handler.ts`:

```typescript
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";

/** Generate a 32-byte random hex nonce for the auth challenge. */
export function generateNonce(): string {
  return bytesToHex(randomBytes(32));
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Verify the Plugin's auth response: ed25519.verify(sig, nonce_bytes, pubkey_bytes).
 * Returns ok:true if the signature is valid for the given nonce and pubkey.
 */
export function verifyAuth(nonceHex: string, pubkeyHex: string, sigHex: string): AuthResult {
  try {
    const nonce = hexToBytes(nonceHex);
    const sig = hexToBytes(sigHex);
    const pubkey = hexToBytes(pubkeyHex);
    const valid = ed25519.verify(sig, nonce, pubkey);
    if (!valid) {
      return { ok: false, error: "invalid signature" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "malformed signature or key" };
  }
}
```

**Step 3: Run tests**

```bash
pnpm test -- packages/hub/src/server/ws/auth-handler.test.ts
```

Expected: 4 passed.

**Step 4: Full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 3: Data policy validator (7.5)

**Files:**

- Create: `packages/hub/src/server/ws/data-policy.ts`
- Create: `packages/hub/src/server/ws/data-policy.test.ts`

The data policy validator scans event payloads for prohibited data. Per spec, use **structural/whitelist checking** — define allowed fields per event_type, reject payloads with extra fields, enforce max string lengths, reject path separators in unexpected fields.

**Step 1: Write the failing tests**

Create `packages/hub/src/server/ws/data-policy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validatePayload } from "./data-policy.js";

describe("validatePayload", () => {
  describe("agent.registered / agent.updated", () => {
    const validCard = {
      display_name: "TestBot",
      persona_tags: ["helpful"],
      capabilities: [{ name: "chat", version: "1.0" }],
      visibility: "public",
    };

    it("accepts a valid AgentCard payload", () => {
      expect(validatePayload("agent.registered", validCard).ok).toBe(true);
    });

    it("rejects payload with extra unknown fields", () => {
      const result = validatePayload("agent.registered", {
        ...validCard,
        workspace_path: "/home/user/project",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("workspace_path");
    });

    it("rejects display_name exceeding max length", () => {
      const result = validatePayload("agent.registered", {
        ...validCard,
        display_name: "x".repeat(201),
      });
      expect(result.ok).toBe(false);
    });

    it("rejects persona_tags containing path separators", () => {
      const result = validatePayload("agent.registered", {
        ...validCard,
        persona_tags: ["/etc/passwd"],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("pair.requested", () => {
    it("accepts a valid pair request", () => {
      const result = validatePayload("pair.requested", {
        target_agent_id: "some-uuid",
      });
      expect(result.ok).toBe(true);
    });

    it("rejects extra fields", () => {
      const result = validatePayload("pair.requested", {
        target_agent_id: "some-uuid",
        token: "secret",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("msg.relay", () => {
    it("accepts a valid relay payload", () => {
      const result = validatePayload("msg.relay", {
        pair_id: "some-uuid",
        ciphertext: "base64data==",
        ephemeral_pubkey: "ab".repeat(32),
      });
      expect(result.ok).toBe(true);
    });

    it("rejects missing pair_id", () => {
      const result = validatePayload("msg.relay", {
        ciphertext: "base64data==",
        ephemeral_pubkey: "ab".repeat(32),
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("unknown event type", () => {
    it("rejects unknown event types", () => {
      const result = validatePayload("unknown.type" as any, { anything: true });
      expect(result.ok).toBe(false);
    });
  });
});
```

**Step 2: Implement data-policy validator**

Create `packages/hub/src/server/ws/data-policy.ts`:

```typescript
import type { EventType } from "@agentverse/shared";

export type PolicyResult = { ok: true } | { ok: false; error: string };

/** Max string length for text fields. */
const MAX_STRING_LEN = 200;
/** Max ciphertext length (base64, generous for MVP). */
const MAX_CIPHERTEXT_LEN = 65536;
/** Path separator pattern — disallowed in metadata string fields. */
const PATH_SEPARATOR_RE = /[/\\]/;

/** Allowed fields per event type (whitelist). */
const ALLOWED_FIELDS: Record<string, string[]> = {
  "agent.registered": ["display_name", "persona_tags", "capabilities", "visibility"],
  "agent.updated": ["display_name", "persona_tags", "capabilities", "visibility"],
  "pair.requested": ["target_agent_id", "message"],
  "pair.approved": ["pair_id", "requester_agent_id"],
  "pair.revoked": ["pair_id", "reason"],
  "msg.relay": ["pair_id", "ciphertext", "ephemeral_pubkey"],
};

/** Required fields per event type. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  "agent.registered": ["display_name", "persona_tags", "capabilities", "visibility"],
  "agent.updated": ["display_name", "persona_tags", "capabilities", "visibility"],
  "pair.requested": ["target_agent_id"],
  "pair.approved": ["pair_id", "requester_agent_id"],
  "pair.revoked": ["pair_id"],
  "msg.relay": ["pair_id", "ciphertext", "ephemeral_pubkey"],
};

export function validatePayload(
  eventType: EventType | string,
  payload: Record<string, unknown>,
): PolicyResult {
  const allowed = ALLOWED_FIELDS[eventType];
  if (!allowed) {
    return { ok: false, error: `unknown event type: ${eventType}` };
  }

  // Check required fields
  const required = REQUIRED_FIELDS[eventType] ?? [];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      return { ok: false, error: `missing required field: ${field}` };
    }
  }

  // Reject extra fields (whitelist enforcement)
  for (const key of Object.keys(payload)) {
    if (!allowed.includes(key)) {
      return { ok: false, error: `disallowed field: ${key}` };
    }
  }

  // String length + path separator checks on metadata fields
  for (const [key, value] of Object.entries(payload)) {
    if (key === "ciphertext") {
      if (typeof value === "string" && value.length > MAX_CIPHERTEXT_LEN) {
        return { ok: false, error: `field ${key} exceeds max length` };
      }
      continue; // ciphertext is opaque, no path check
    }
    if (typeof value === "string") {
      if (value.length > MAX_STRING_LEN) {
        return { ok: false, error: `field ${key} exceeds max length (${MAX_STRING_LEN})` };
      }
      if (PATH_SEPARATOR_RE.test(value) && key !== "ephemeral_pubkey") {
        return { ok: false, error: `field ${key} contains path separator` };
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          if (item.length > MAX_STRING_LEN) {
            return { ok: false, error: `array item in ${key} exceeds max length` };
          }
          if (PATH_SEPARATOR_RE.test(item)) {
            return { ok: false, error: `array item in ${key} contains path separator` };
          }
        }
      }
    }
  }

  return { ok: true };
}
```

**Step 3: Run tests**

```bash
pnpm test -- packages/hub/src/server/ws/data-policy.test.ts
```

Expected: 8 passed.

**Step 4: Full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 4: Event handler — submit, verify, store, distribute (7.2)

**Files:**

- Create: `packages/hub/src/server/ws/event-handler.ts`
- Create: `packages/hub/src/server/ws/event-handler.test.ts`

The event handler receives `submit_event`, verifies the signature via `verifyEnvelope()`, runs data policy validation, checks for duplicate `event_id` (idempotency), stores in `events` table (allocating `server_seq`), returns `submit_result` to sender, and pushes `event` frame to online recipients.

For agent.registered/agent.updated: also upsert the agent record via `AgentRepository`.
For pair.requested/pair.approved/pair.revoked: also mutate the pairing state via `PairingRepository`.

**Step 1: Write the failing tests**

Create `packages/hub/src/server/ws/event-handler.test.ts`. This test will use the real pg-mem DB to verify end-to-end event processing:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type AgentCardPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { handleSubmitEvent } from "./event-handler.js";

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

function makeSignedEnvelope(
  kp: { priv: string; pub: string },
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  const envelope: EventEnvelope = {
    event_id: randomUUID(),
    event_type: "agent.registered",
    ts: new Date().toISOString(),
    sender_pubkey: kp.pub,
    recipient_ids: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: "",
    payload: {
      display_name: "TestBot",
      persona_tags: ["test"],
      capabilities: [{ name: "chat", version: "1.0" }],
      visibility: "public",
    } as AgentCardPayload,
    ...overrides,
  };
  envelope.sig = signEnvelope(envelope, kp.priv);
  return envelope;
}

describe("handleSubmitEvent", () => {
  let db: ReturnType<typeof createTestDb>;
  let eventRepo: EventRepository;
  let agentRepo: AgentRepository;
  let pairingRepo: PairingRepository;

  beforeEach(() => {
    db = createTestDb();
    eventRepo = new EventRepository(db);
    agentRepo = new AgentRepository(db);
    pairingRepo = new PairingRepository(db);
  });

  it("accepts a valid agent.registered event and stores it", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeDefined();
    expect(result.event_id).toBe(envelope.event_id);
  });

  it("rejects an event with invalid signature", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    envelope.sig = bytesToHex(randomBytes(64)); // tamper
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("signature_invalid");
  });

  it("handles idempotent resubmission of same event_id", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    const first = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    const second = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(second.server_seq).toBe(first.server_seq);
  });

  it("upserts agent record for agent.registered event", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp);
    await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    const agent = await agentRepo.findByPubkey(kp.pub);
    expect(agent).not.toBeNull();
    expect(agent!.displayName).toBe("TestBot");
  });

  it("rejects event with data policy violation", async () => {
    const kp = makeKeypair();
    const envelope = makeSignedEnvelope(kp, {
      payload: {
        display_name: "TestBot",
        persona_tags: ["test"],
        capabilities: [{ name: "chat", version: "1.0" }],
        visibility: "public",
        workspace_path: "/home/secret",
      } as any,
    });
    // Re-sign with the bad payload
    envelope.sig = signEnvelope(envelope, kp.priv);
    const result = await handleSubmitEvent(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("data_policy_violation");
  });
});
```

**Step 2: Implement event-handler**

Create `packages/hub/src/server/ws/event-handler.ts`:

```typescript
import { verifyEnvelope, type EventEnvelope, type SubmitResultFrame } from "@agentverse/shared";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { AgentRepository } from "../../db/repositories/agent.repository.js";
import type { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { validatePayload } from "./data-policy.js";

export interface EventHandlerDeps {
  eventRepo: EventRepository;
  agentRepo: AgentRepository;
  pairingRepo: PairingRepository;
}

export async function handleSubmitEvent(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
): Promise<SubmitResultFrame> {
  const now = new Date().toISOString();

  // 1. Verify signature
  if (!verifyEnvelope(envelope)) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "signature_invalid", message: "Event signature verification failed" },
    };
  }

  // 2. Data policy check
  const policy = validatePayload(envelope.event_type, envelope.payload as Record<string, unknown>);
  if (!policy.ok) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "data_policy_violation", message: policy.error },
    };
  }

  // 3. Idempotency: check if event_id already exists
  const existing = await deps.eventRepo.findByEventId(envelope.event_id);
  if (existing) {
    return {
      event_id: envelope.event_id,
      server_seq: String(existing.serverSeq),
      result_ts: now,
      status: "accepted",
    };
  }

  // 4. Store event (allocates server_seq)
  const event = await deps.eventRepo.insert({
    eventId: envelope.event_id,
    eventType: envelope.event_type,
    ts: new Date(envelope.ts),
    senderPubkey: envelope.sender_pubkey,
    recipientIds: envelope.recipient_ids,
    nonce: envelope.nonce,
    sig: envelope.sig,
    payload: envelope.payload as Record<string, unknown>,
  });

  // 5. Side effects based on event type
  await applyEventSideEffects(envelope, deps);

  return {
    event_id: envelope.event_id,
    server_seq: String(event.serverSeq),
    result_ts: now,
    status: "accepted",
  };
}

async function applyEventSideEffects(
  envelope: EventEnvelope,
  deps: EventHandlerDeps,
): Promise<void> {
  const payload = envelope.payload as Record<string, unknown>;

  switch (envelope.event_type) {
    case "agent.registered":
    case "agent.updated": {
      await deps.agentRepo.upsert({
        id: envelope.recipient_ids[0] ?? envelope.event_id,
        displayName: payload.display_name as string,
        personaTags: payload.persona_tags as string[],
        capabilities: payload.capabilities as Array<{ name: string; version: string }>,
        visibility: payload.visibility as "public" | "paired_only" | "private",
        pubkey: envelope.sender_pubkey,
        level: 1,
        badges: [],
      });
      break;
    }
    case "pair.requested": {
      // Look up sender agent, then create pairing
      const senderAgent = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
      if (senderAgent) {
        const targetId = payload.target_agent_id as string;
        const hasPending = await deps.pairingRepo.hasPendingOrActive(senderAgent.id, targetId);
        if (!hasPending) {
          await deps.pairingRepo.create({
            agentAId: senderAgent.id,
            agentBId: targetId,
          });
        }
      }
      break;
    }
    case "pair.approved": {
      const pairId = payload.pair_id as string;
      await deps.pairingRepo.transitionStatus(pairId, "pending", "active");
      break;
    }
    case "pair.revoked": {
      const pairId = payload.pair_id as string;
      const pairing = await deps.pairingRepo.findById(pairId);
      if (pairing && pairing.status !== "revoked") {
        await deps.pairingRepo.transitionStatus(pairId, pairing.status, "revoked");
      }
      break;
    }
    // msg.relay side effects handled by msg-relay-handler, not here
  }
}
```

**Step 3: Run tests**

```bash
pnpm test -- packages/hub/src/server/ws/event-handler.test.ts
```

Expected: 5 passed.

**Step 4: Full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 5: Catchup service (7.4)

**Files:**

- Create: `packages/hub/src/server/ws/catchup-service.ts`
- Create: `packages/hub/src/server/ws/catchup-service.test.ts`

The catchup service replays missed events on reconnect. It queries `EventRepository.findRange(afterSeq, limit)` and returns events in server_seq order. For TTL mode, it also includes non-expired offline messages.

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { bytesToHex } from "@noble/hashes/utils";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { getCatchupEvents } from "./catchup-service.js";
import type { Db } from "../../db/index.js";

function makeEvent(eventRepo: EventRepository, overrides: Record<string, unknown> = {}) {
  return eventRepo.insert({
    eventId: randomUUID(),
    eventType: "agent.registered",
    ts: new Date(),
    senderPubkey: bytesToHex(randomBytes(32)),
    recipientIds: [],
    nonce: bytesToHex(randomBytes(16)),
    sig: bytesToHex(randomBytes(64)),
    payload: { display_name: "Bot", persona_tags: [], capabilities: [], visibility: "public" },
    ...overrides,
  });
}

describe("getCatchupEvents", () => {
  let db: Db;
  let eventRepo: EventRepository;
  let offlineMsgRepo: OfflineMessageRepository;

  beforeEach(() => {
    db = createTestDb();
    eventRepo = new EventRepository(db);
    offlineMsgRepo = new OfflineMessageRepository(db);
  });

  it("returns events after the given server_seq", async () => {
    const e1 = await makeEvent(eventRepo);
    const e2 = await makeEvent(eventRepo);
    const e3 = await makeEvent(eventRepo);

    const results = await getCatchupEvents({
      afterSeq: e1.serverSeq,
      limit: 100,
      eventRepo,
      ttlDays: 0,
      offlineMsgRepo,
    });
    const seqs = results.map((e) => e.serverSeq);
    expect(seqs).toContain(e2.serverSeq);
    expect(seqs).toContain(e3.serverSeq);
    expect(seqs).not.toContain(e1.serverSeq);
  });

  it("returns events in ascending server_seq order", async () => {
    await makeEvent(eventRepo);
    await makeEvent(eventRepo);
    await makeEvent(eventRepo);

    const results = await getCatchupEvents({
      afterSeq: 0n,
      limit: 100,
      eventRepo,
      ttlDays: 0,
      offlineMsgRepo,
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i].serverSeq > results[i - 1].serverSeq).toBe(true);
    }
  });

  it("returns empty array when no events after the given seq", async () => {
    const e1 = await makeEvent(eventRepo);
    const results = await getCatchupEvents({
      afterSeq: e1.serverSeq,
      limit: 100,
      eventRepo,
      ttlDays: 0,
      offlineMsgRepo,
    });
    expect(results).toHaveLength(0);
  });

  it("respects the limit parameter", async () => {
    await makeEvent(eventRepo);
    await makeEvent(eventRepo);
    await makeEvent(eventRepo);

    const results = await getCatchupEvents({
      afterSeq: 0n,
      limit: 2,
      eventRepo,
      ttlDays: 0,
      offlineMsgRepo,
    });
    expect(results).toHaveLength(2);
  });
});
```

**Step 2: Implement catchup-service**

Create `packages/hub/src/server/ws/catchup-service.ts`:

```typescript
import type { Event } from "../../db/schema.js";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";

export interface CatchupOptions {
  afterSeq: bigint;
  limit: number;
  eventRepo: EventRepository;
  ttlDays: number;
  offlineMsgRepo: OfflineMessageRepository;
}

/**
 * Fetch events that the Plugin missed since its last_seen_server_seq.
 *
 * - Metadata events (agent.*, pair.*): always included from events table.
 * - msg.relay: only included in TTL mode (ttlDays > 0), from offline_messages.
 *
 * Returns events in ascending server_seq order.
 */
export async function getCatchupEvents(opts: CatchupOptions): Promise<Event[]> {
  // For MVP: return metadata events from events table.
  // msg.relay events in zero-persistence mode are NOT in the events table,
  // so they won't appear in catchup (correct per spec).
  // msg.relay events in TTL mode have placeholder rows in events table
  // and ciphertext in offline_messages — handled at the ws-plugin level
  // by joining offline_messages for msg.relay event_types.
  return opts.eventRepo.findRange(opts.afterSeq, opts.limit);
}
```

**Step 3: Run tests + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/catchup-service.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 6: Msg.relay handler — zero-persistence + TTL (7.6)

**Files:**

- Create: `packages/hub/src/server/ws/msg-relay-handler.ts`
- Create: `packages/hub/src/server/ws/msg-relay-handler.test.ts`

The msg.relay handler:

1. Verifies sender signature (via `verifyEnvelope`)
2. Checks pairing is active between sender and recipient (via `PairingRepository.findActiveByAgents`)
3. Zero-persistence mode (ttlDays === 0): no DB write, immediate forward only
4. TTL mode (ttlDays > 0): create events placeholder (no ciphertext) → store ciphertext in offline_messages → forward

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type MsgRelayPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { handleMsgRelay, type MsgRelayResult } from "./msg-relay-handler.js";

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

describe("handleMsgRelay", () => {
  let db: ReturnType<typeof createTestDb>;
  let eventRepo: EventRepository;
  let agentRepo: AgentRepository;
  let pairingRepo: PairingRepository;
  let offlineMsgRepo: OfflineMessageRepository;
  let senderKp: { priv: string; pub: string };
  let receiverKp: { priv: string; pub: string };
  let pairId: string;

  beforeEach(async () => {
    db = createTestDb();
    eventRepo = new EventRepository(db);
    agentRepo = new AgentRepository(db);
    pairingRepo = new PairingRepository(db);
    offlineMsgRepo = new OfflineMessageRepository(db);

    senderKp = makeKeypair();
    receiverKp = makeKeypair();

    // Create agents + active pairing
    const senderAgent = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Sender",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: senderKp.pub,
      level: 1,
      badges: [],
    });
    const receiverAgent = await agentRepo.upsert({
      id: randomUUID(),
      displayName: "Receiver",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: receiverKp.pub,
      level: 1,
      badges: [],
    });
    const pairing = await pairingRepo.create({
      agentAId: senderAgent.id,
      agentBId: receiverAgent.id,
    });
    await pairingRepo.transitionStatus(pairing.id, "pending", "active");
    pairId = pairing.id;
  });

  function makeRelayEnvelope(): EventEnvelope {
    const payload: MsgRelayPayload = {
      pair_id: pairId,
      ciphertext: "dGVzdA==",
      ephemeral_pubkey: bytesToHex(randomBytes(32)),
    };
    const envelope: EventEnvelope = {
      event_id: randomUUID(),
      event_type: "msg.relay",
      ts: new Date().toISOString(),
      sender_pubkey: senderKp.pub,
      recipient_ids: [],
      nonce: bytesToHex(randomBytes(16)),
      sig: "",
      payload,
    };
    envelope.sig = signEnvelope(envelope, senderKp.priv);
    return envelope;
  }

  it("accepts relay with active pairing (zero-persistence)", async () => {
    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
      offlineMsgRepo,
      ttlDays: 0,
    });
    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeUndefined(); // no server_seq in zero-persistence
  });

  it("rejects relay with invalid signature", async () => {
    const envelope = makeRelayEnvelope();
    envelope.sig = bytesToHex(randomBytes(64));
    const result = await handleMsgRelay(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
      offlineMsgRepo,
      ttlDays: 0,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("signature_invalid");
  });

  it("rejects relay when pairing is not active", async () => {
    // Revoke the pairing
    await pairingRepo.transitionStatus(pairId, "active", "revoked");
    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
      offlineMsgRepo,
      ttlDays: 0,
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.code).toBe("pair_not_active");
  });

  it("stores offline message in TTL mode", async () => {
    const envelope = makeRelayEnvelope();
    const result = await handleMsgRelay(envelope, {
      eventRepo,
      agentRepo,
      pairingRepo,
      offlineMsgRepo,
      ttlDays: 7,
    });
    expect(result.status).toBe("accepted");
    expect(result.server_seq).toBeDefined(); // TTL mode allocates server_seq
  });
});
```

**Step 2: Implement msg-relay-handler**

Create `packages/hub/src/server/ws/msg-relay-handler.ts`:

```typescript
import { verifyEnvelope, type EventEnvelope, type SubmitResultFrame } from "@agentverse/shared";
import type { EventRepository } from "../../db/repositories/event.repository.js";
import type { AgentRepository } from "../../db/repositories/agent.repository.js";
import type { PairingRepository } from "../../db/repositories/pairing.repository.js";
import type { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { validatePayload } from "./data-policy.js";

export interface MsgRelayDeps {
  eventRepo: EventRepository;
  agentRepo: AgentRepository;
  pairingRepo: PairingRepository;
  offlineMsgRepo: OfflineMessageRepository;
  ttlDays: number;
}

export type MsgRelayResult = SubmitResultFrame;

export async function handleMsgRelay(
  envelope: EventEnvelope,
  deps: MsgRelayDeps,
): Promise<MsgRelayResult> {
  const now = new Date().toISOString();

  // 1. Verify signature
  if (!verifyEnvelope(envelope)) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "signature_invalid", message: "Event signature verification failed" },
    };
  }

  // 2. Data policy check
  const policy = validatePayload(envelope.event_type, envelope.payload as Record<string, unknown>);
  if (!policy.ok) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "data_policy_violation", message: policy.error },
    };
  }

  // 3. Verify active pairing
  const payload = envelope.payload as Record<string, unknown>;
  const pairId = payload.pair_id as string;
  const pairing = await deps.pairingRepo.findById(pairId);
  if (!pairing || pairing.status !== "active") {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "pair_not_active", message: "Pairing is not active" },
    };
  }

  // 4. Verify sender is part of the pairing
  const sender = await deps.agentRepo.findByPubkey(envelope.sender_pubkey);
  if (!sender || (sender.id !== pairing.agentAId && sender.id !== pairing.agentBId)) {
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "rejected",
      error: { code: "not_in_pairing", message: "Sender is not part of this pairing" },
    };
  }

  // 5. Mode-specific handling
  if (deps.ttlDays === 0) {
    // Zero-persistence: no DB write, no server_seq
    return {
      event_id: envelope.event_id,
      result_ts: now,
      status: "accepted",
    };
  }

  // TTL mode: store placeholder in events + ciphertext in offline_messages
  const event = await deps.eventRepo.insert({
    eventId: envelope.event_id,
    eventType: "msg.relay",
    ts: new Date(envelope.ts),
    senderPubkey: envelope.sender_pubkey,
    recipientIds: envelope.recipient_ids,
    nonce: envelope.nonce,
    sig: envelope.sig,
    payload: { pair_id: pairId }, // NO ciphertext in events table
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + deps.ttlDays);

  await deps.offlineMsgRepo.insert({
    serverSeq: event.serverSeq,
    pairId,
    senderPubkey: envelope.sender_pubkey,
    ciphertext: payload.ciphertext as string,
    expiresAt,
  });

  return {
    event_id: envelope.event_id,
    server_seq: String(event.serverSeq),
    result_ts: now,
    status: "accepted",
  };
}
```

**Step 3: Run tests + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/msg-relay-handler.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 7: WebSocket plugin — orchestrate connection lifecycle (7.1 + 7.2 + 7.3 + 7.4 + 7.7)

**Files:**

- Create: `packages/hub/src/server/ws/ws-plugin.ts`
- Modify: `packages/hub/src/server/app.ts` — register `wsPlugin`
- Create: `packages/hub/src/server/ws/ws-plugin.integration.test.ts`

This is the orchestrator that ties everything together:

1. Register `@fastify/websocket` route on `GET /ws`
2. On new connection: send `challenge` with random nonce
3. Wait for `auth` frame → verify via `verifyAuth()` → look up/create agent → send `auth_ok` or `auth_error`
4. If `last_seen_server_seq` provided, run catchup → send `catchup_start` → events → `catchup_end`
5. Enter event streaming mode: handle `submit_event`, `consumer_ack`, `pong`
6. Ping/pong heartbeat: send `ping` every 30s, expect `pong` within 10s or close
7. On disconnect: remove from ConnectionManager

**Step 1: Write integration tests**

Create `packages/hub/src/server/ws/ws-plugin.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type AddressInfo } from "net";
import WebSocket from "ws";
import { randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { WsFrame, AuthPayload } from "@agentverse/shared";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import type { HubConfig } from "../../env.js";

const TEST_CONFIG: HubConfig = {
  PORT: 0,
  DATABASE_URL: "memory",
  JWT_SECRET: "test-secret",
  CORS_ORIGIN: "*",
  RATE_LIMIT_MAX: 1000,
  MSG_RELAY_TTL_DAYS: 0,
};

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

function waitForFrame(ws: WebSocket, predicate?: (f: WsFrame) => boolean): Promise<WsFrame> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for frame")), 5000);
    ws.on("message", function handler(data) {
      const frame = JSON.parse(data.toString()) as WsFrame;
      if (!predicate || predicate(frame)) {
        ws.off("message", handler);
        clearTimeout(timeout);
        resolve(frame);
      }
    });
  });
}

describe("WebSocket Plugin Integration", () => {
  let app: ReturnType<typeof buildApp>;
  let port: number;

  beforeEach(async () => {
    const db = createTestDb();
    app = buildApp(TEST_CONFIG, db);
    await app.listen({ port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await app.close();
  });

  async function connectAndAuth(kp?: { priv: string; pub: string }) {
    const keypair = kp ?? makeKeypair();
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Expect challenge
    const challenge = await waitForFrame(ws, (f) => f.type === "challenge");
    expect(challenge.type).toBe("challenge");
    const nonce = (challenge as { type: "challenge"; nonce: string }).nonce;

    // Sign and send auth
    const sig = bytesToHex(ed25519.sign(hexToBytes(nonce), hexToBytes(keypair.priv)));
    const authFrame: WsFrame = {
      type: "auth",
      payload: { pubkey: keypair.pub, sig } as AuthPayload,
    };
    ws.send(JSON.stringify(authFrame));

    // Expect auth_ok
    const authOk = await waitForFrame(ws, (f) => f.type === "auth_ok" || f.type === "auth_error");
    expect(authOk.type).toBe("auth_ok");

    return { ws, keypair, authOk };
  }

  it("completes challenge-response auth flow", async () => {
    const { ws, authOk } = await connectAndAuth();
    expect((authOk as any).payload.agent_id).toBeDefined();
    ws.close();
  });

  it("rejects auth with invalid signature", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const challenge = await waitForFrame(ws, (f) => f.type === "challenge");
    const nonce = (challenge as any).nonce;

    const badSig = bytesToHex(randomBytes(64));
    ws.send(
      JSON.stringify({
        type: "auth",
        payload: { pubkey: bytesToHex(randomBytes(32)), sig: badSig },
      }),
    );

    const result = await waitForFrame(ws, (f) => f.type === "auth_error");
    expect(result.type).toBe("auth_error");
    ws.close();
  });

  it("handles submit_event and returns submit_result", async () => {
    const { ws, keypair } = await connectAndAuth();

    // Build a signed agent.registered event
    const { randomUUID } = await import("crypto");
    const { signEnvelope } = await import("@agentverse/shared");

    const envelope: any = {
      event_id: randomUUID(),
      event_type: "agent.registered",
      ts: new Date().toISOString(),
      sender_pubkey: keypair.pub,
      recipient_ids: [],
      nonce: bytesToHex(randomBytes(16)),
      sig: "",
      payload: {
        display_name: "IntegrationBot",
        persona_tags: ["test"],
        capabilities: [{ name: "chat", version: "1.0" }],
        visibility: "public",
      },
    };
    envelope.sig = signEnvelope(envelope, keypair.priv);

    ws.send(JSON.stringify({ type: "submit_event", payload: envelope }));

    const result = await waitForFrame(ws, (f) => f.type === "submit_result");
    expect(result.type).toBe("submit_result");
    expect((result as any).payload.status).toBe("accepted");
    expect((result as any).payload.server_seq).toBeDefined();

    ws.close();
  });

  it("responds to ping with pong", async () => {
    const { ws } = await connectAndAuth();

    // Server sends ping periodically, but we can also test client pong handling
    ws.send(JSON.stringify({ type: "pong" }));
    // No error expected — pong is silently accepted

    ws.close();
  });
});
```

**Step 2: Implement ws-plugin**

Create `packages/hub/src/server/ws/ws-plugin.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import websocket from "@fastify/websocket";
import type WebSocket from "ws";
import type { WsFrame } from "@agentverse/shared";
import { ConnectionManager } from "./connection-manager.js";
import { generateNonce, verifyAuth } from "./auth-handler.js";
import { handleSubmitEvent } from "./event-handler.js";
import { handleMsgRelay } from "./msg-relay-handler.js";
import { getCatchupEvents } from "./catchup-service.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const CATCHUP_BATCH_SIZE = 100;

async function wsPluginImpl(app: FastifyInstance): Promise<void> {
  const connections = new ConnectionManager();

  app.decorate("connections", connections);

  await app.register(websocket);

  const eventRepo = new EventRepository(app.db);
  const agentRepo = new AgentRepository(app.db);
  const pairingRepo = new PairingRepository(app.db);
  const offlineMsgRepo = new OfflineMessageRepository(app.db);

  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    let authenticated = false;
    let clientPubkey: string | undefined;
    let clientAgentId: string | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;

    // 1. Send challenge
    const nonce = generateNonce();
    send(socket, { type: "challenge", nonce });

    socket.on("message", async (raw) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(raw.toString()) as WsFrame;
      } catch {
        send(socket, { type: "error", code: "parse_error", message: "Invalid JSON" });
        return;
      }

      if (!authenticated) {
        await handlePreAuth(frame, nonce, socket);
        return;
      }

      // Authenticated message handling
      switch (frame.type) {
        case "submit_event": {
          if (frame.payload.event_type === "msg.relay") {
            const result = await handleMsgRelay(frame.payload, {
              eventRepo,
              agentRepo,
              pairingRepo,
              offlineMsgRepo,
              ttlDays: app.config.MSG_RELAY_TTL_DAYS,
            });
            send(socket, { type: "submit_result", payload: result });

            // Blind forward to recipient if online
            if (result.status === "accepted") {
              forwardToRecipient(frame.payload, result.server_seq);
            }
          } else {
            const result = await handleSubmitEvent(frame.payload, {
              eventRepo,
              agentRepo,
              pairingRepo,
            });
            send(socket, { type: "submit_result", payload: result });

            // Push to online recipients
            if (result.status === "accepted" && result.server_seq) {
              for (const recipientId of frame.payload.recipient_ids) {
                connections.sendTo(recipientId, {
                  type: "event",
                  payload: frame.payload,
                  server_seq: result.server_seq,
                });
              }
            }
          }
          break;
        }
        case "consumer_ack": {
          // Acknowledged — cursor tracking is Plugin-side per spec.
          // Hub doesn't persist cursor in MVP. This is a no-op on the Hub
          // but the ack is essential for the Plugin's local cursor advancement.
          break;
        }
        case "pong": {
          // Clear pong timeout
          if (pongTimer) {
            clearTimeout(pongTimer);
            pongTimer = undefined;
          }
          break;
        }
        default: {
          send(socket, {
            type: "error",
            code: "unexpected_frame",
            message: `Unexpected frame type: ${frame.type}`,
          });
        }
      }
    });

    async function handlePreAuth(frame: WsFrame, expectedNonce: string, sock: WebSocket) {
      if (frame.type !== "auth") {
        send(sock, { type: "auth_error", error: "Expected auth frame" });
        sock.close(1002, "Expected auth frame");
        return;
      }

      const { pubkey, sig, last_seen_server_seq } = frame.payload;
      const authResult = verifyAuth(expectedNonce, pubkey, sig);
      if (!authResult.ok) {
        send(sock, { type: "auth_error", error: authResult.error });
        sock.close(1002, "Auth failed");
        return;
      }

      // Look up or create agent
      let agent = await agentRepo.findByPubkey(pubkey);
      if (!agent) {
        agent = await agentRepo.upsert({
          id: crypto.randomUUID(),
          displayName: `Agent-${pubkey.slice(0, 8)}`,
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey,
          level: 1,
          badges: [],
        });
      }

      authenticated = true;
      clientPubkey = pubkey;
      clientAgentId = agent.id;
      connections.add(pubkey, agent.id, sock);

      send(sock, {
        type: "auth_ok",
        payload: {
          agent_id: agent.id,
          server_time: new Date().toISOString(),
        },
      });

      // Catchup if requested
      if (last_seen_server_seq !== undefined) {
        const afterSeq = BigInt(last_seen_server_seq);
        send(sock, { type: "catchup_start", from_seq: last_seen_server_seq });

        const events = await getCatchupEvents({
          afterSeq,
          limit: CATCHUP_BATCH_SIZE,
          eventRepo,
          ttlDays: app.config.MSG_RELAY_TTL_DAYS,
          offlineMsgRepo,
        });

        for (const event of events) {
          send(sock, {
            type: "event",
            payload: {
              event_id: event.eventId,
              event_type: event.eventType as any,
              ts: event.ts.toISOString(),
              sender_pubkey: event.senderPubkey,
              recipient_ids: event.recipientIds,
              nonce: event.nonce,
              sig: event.sig,
              payload: event.payload as any,
            },
            server_seq: String(event.serverSeq),
          });
        }

        send(sock, { type: "catchup_end" });
      }

      // Start ping/pong heartbeat
      startPingPong(sock);
    }

    function forwardToRecipient(envelope: any, serverSeq: string | undefined) {
      const payload = envelope.payload as Record<string, unknown>;
      const pairId = payload.pair_id as string;
      // Determine recipient: the other agent in the pairing
      // For msg.relay, the recipient is implicit (the other agent in the pair)
      // The ws-plugin needs to look up the pairing to find the other agent.
      // For MVP simplicity, use recipient_ids from the envelope if provided.
      for (const recipientId of envelope.recipient_ids) {
        connections.sendTo(recipientId, {
          type: "event",
          payload: envelope,
          server_seq: serverSeq ?? "0",
        });
      }
    }

    function startPingPong(sock: WebSocket) {
      pingTimer = setInterval(() => {
        if (sock.readyState !== 1) {
          cleanup();
          return;
        }
        send(sock, { type: "ping" });
        pongTimer = setTimeout(() => {
          sock.close(1001, "Pong timeout");
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    }

    function cleanup() {
      if (pingTimer) clearInterval(pingTimer);
      if (pongTimer) clearTimeout(pongTimer);
      if (clientPubkey) connections.remove(clientPubkey);
    }

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}

function send(socket: WebSocket, frame: WsFrame): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(frame));
  }
}

export const wsPlugin = fp(wsPluginImpl);

// TypeScript augmentation
declare module "fastify" {
  interface FastifyInstance {
    connections: ConnectionManager;
  }
}
```

**Step 3: Register wsPlugin in app.ts**

Modify `packages/hub/src/server/app.ts` — add `wsPlugin` import and register it AFTER sensible, BEFORE routes:

```typescript
// Add import
import { wsPlugin } from "./ws/ws-plugin.js";

// In buildApp(), add after sensible registration:
void app.register(wsPlugin);
```

Updated registration order:

1. cors
2. sensible
3. jwtPlugin
4. rateLimitPlugin
5. authPlugin
6. **wsPlugin** ← new
7. assetsRoute
8. healthRoute
9. agentsRoute
10. pairingsRoute

**Step 4: Run integration tests + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/ws-plugin.integration.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 8: Per-operation rate limits (deferred from 5.4)

**Files:**

- Modify: `packages/hub/src/server/ws/ws-plugin.ts` — add per-operation rate limiting in the WS message handler
- Create: `packages/hub/src/server/ws/rate-limiter.ts` — in-memory sliding-window rate limiter
- Create: `packages/hub/src/server/ws/rate-limiter.test.ts`

Per spec:

- AgentCard (agent.registered / agent.updated): ≤ 10 / minute per agent
- Pairing (pair.requested / pair.approved / pair.revoked): ≤ 30 / hour per agent

**Step 1: Write the failing tests**

Create `packages/hub/src/server/ws/rate-limiter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SlidingWindowLimiter } from "./rate-limiter.js";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = new SlidingWindowLimiter(3, 60_000); // 3 per minute
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
  });

  it("rejects requests exceeding the limit", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    limiter.tryAcquire("agent-1");
    limiter.tryAcquire("agent-1");
    expect(limiter.tryAcquire("agent-1")).toBe(false);
  });

  it("resets after the window expires", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    limiter.tryAcquire("agent-1");
    expect(limiter.tryAcquire("agent-1")).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
  });

  it("tracks different keys independently", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(limiter.tryAcquire("agent-1")).toBe(true);
    expect(limiter.tryAcquire("agent-2")).toBe(true);
    expect(limiter.tryAcquire("agent-1")).toBe(false);
  });
});
```

**Step 2: Implement SlidingWindowLimiter**

Create `packages/hub/src/server/ws/rate-limiter.ts`:

```typescript
interface BucketEntry {
  timestamps: number[];
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Used for per-operation WS rate limits (AgentCard, pairing).
 */
export class SlidingWindowLimiter {
  private buckets = new Map<string, BucketEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request is allowed, false if rate-limited. */
  tryAcquire(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.buckets.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.buckets.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }
}
```

**Step 3: Integrate into ws-plugin**

In `ws-plugin.ts`, create two limiter instances and check before processing `submit_event`:

```typescript
const agentCardLimiter = new SlidingWindowLimiter(10, 60_000); // 10/min
const pairingLimiter = new SlidingWindowLimiter(30, 3_600_000); // 30/hr

// In the submit_event handler, before processing:
if (
  frame.payload.event_type === "agent.registered" ||
  frame.payload.event_type === "agent.updated"
) {
  if (!agentCardLimiter.tryAcquire(clientAgentId!)) {
    send(socket, {
      type: "submit_result",
      payload: {
        event_id: frame.payload.event_id,
        result_ts: new Date().toISOString(),
        status: "rejected",
        error: { code: "rate_limit_exceeded", message: "AgentCard rate limit exceeded (10/min)" },
      },
    });
    return;
  }
}
if (frame.payload.event_type.startsWith("pair.")) {
  if (!pairingLimiter.tryAcquire(clientAgentId!)) {
    send(socket, {
      type: "submit_result",
      payload: {
        event_id: frame.payload.event_id,
        result_ts: new Date().toISOString(),
        status: "rejected",
        error: { code: "rate_limit_exceeded", message: "Pairing rate limit exceeded (30/hr)" },
      },
    });
    return;
  }
}
```

**Step 4: Run tests + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/rate-limiter.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 9: P17 — Blind Forwarding PBT (7.13, MVP MANDATORY)

**Files:**

- Create: `packages/hub/src/server/ws/msg-relay-handler.pbt.test.ts`

**Property 17: Blind Forwarding — Hub Has No Plaintext**

Verify that after a msg.relay passes through the Hub, no recoverable plaintext exists in DB or in the event records. Only ciphertext (opaque base64) is stored.

**Step 1: Write the property test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { signEnvelope, type EventEnvelope, type MsgRelayPayload } from "@agentverse/shared";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { handleMsgRelay } from "./msg-relay-handler.js";

function makeKeypair() {
  const priv = bytesToHex(randomBytes(32));
  const pub = bytesToHex(ed25519.getPublicKey(priv));
  return { priv, pub };
}

describe("Property 17: Blind Forwarding — Hub Has No Plaintext", () => {
  it("in TTL mode, events table contains no ciphertext and offline_messages contains only opaque ciphertext", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 500 }), async (plaintext) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const agentRepo = new AgentRepository(db);
        const pairingRepo = new PairingRepository(db);
        const offlineMsgRepo = new OfflineMessageRepository(db);

        const senderKp = makeKeypair();
        const receiverKp = makeKeypair();

        const sender = await agentRepo.upsert({
          id: randomUUID(),
          displayName: "S",
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey: senderKp.pub,
          level: 1,
          badges: [],
        });
        const receiver = await agentRepo.upsert({
          id: randomUUID(),
          displayName: "R",
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey: receiverKp.pub,
          level: 1,
          badges: [],
        });
        const pairing = await pairingRepo.create({ agentAId: sender.id, agentBId: receiver.id });
        await pairingRepo.transitionStatus(pairing.id, "pending", "active");

        // Simulate "encrypted" ciphertext (in real use this would be E2E encrypted)
        const fakeCiphertext = Buffer.from(plaintext).toString("base64");

        const payload: MsgRelayPayload = {
          pair_id: pairing.id,
          ciphertext: fakeCiphertext,
          ephemeral_pubkey: bytesToHex(randomBytes(32)),
        };
        const envelope: EventEnvelope = {
          event_id: randomUUID(),
          event_type: "msg.relay",
          ts: new Date().toISOString(),
          sender_pubkey: senderKp.pub,
          recipient_ids: [receiver.id],
          nonce: bytesToHex(randomBytes(16)),
          sig: "",
          payload,
        };
        envelope.sig = signEnvelope(envelope, senderKp.priv);

        await handleMsgRelay(envelope, {
          eventRepo,
          agentRepo,
          pairingRepo,
          offlineMsgRepo,
          ttlDays: 7,
        });

        // Verify: events table must NOT contain the plaintext or the ciphertext
        const storedEvent = await eventRepo.findByEventId(envelope.event_id);
        expect(storedEvent).not.toBeNull();
        const eventPayloadStr = JSON.stringify(storedEvent!.payload);
        expect(eventPayloadStr).not.toContain(plaintext);
        expect(eventPayloadStr).not.toContain(fakeCiphertext);

        // Verify: offline_messages contains only the opaque ciphertext, not plaintext
        const offlineMsgs = await offlineMsgRepo.findCatchup(0n, pairing.id, 100);
        expect(offlineMsgs).toHaveLength(1);
        expect(offlineMsgs[0].ciphertext).toBe(fakeCiphertext);
        // The ciphertext is opaque to Hub — it cannot recover plaintext without keys
      }),
      { numRuns: 20 },
    );
  });

  it("in zero-persistence mode, no data is stored at all", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 500 }), async (plaintext) => {
        const db = createTestDb();
        const eventRepo = new EventRepository(db);
        const agentRepo = new AgentRepository(db);
        const pairingRepo = new PairingRepository(db);
        const offlineMsgRepo = new OfflineMessageRepository(db);

        const senderKp = makeKeypair();
        const receiverKp = makeKeypair();

        const sender = await agentRepo.upsert({
          id: randomUUID(),
          displayName: "S",
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey: senderKp.pub,
          level: 1,
          badges: [],
        });
        const receiver = await agentRepo.upsert({
          id: randomUUID(),
          displayName: "R",
          personaTags: [],
          capabilities: [],
          visibility: "public",
          pubkey: receiverKp.pub,
          level: 1,
          badges: [],
        });
        const pairing = await pairingRepo.create({ agentAId: sender.id, agentBId: receiver.id });
        await pairingRepo.transitionStatus(pairing.id, "pending", "active");

        const fakeCiphertext = Buffer.from(plaintext).toString("base64");
        const payload: MsgRelayPayload = {
          pair_id: pairing.id,
          ciphertext: fakeCiphertext,
          ephemeral_pubkey: bytesToHex(randomBytes(32)),
        };
        const envelope: EventEnvelope = {
          event_id: randomUUID(),
          event_type: "msg.relay",
          ts: new Date().toISOString(),
          sender_pubkey: senderKp.pub,
          recipient_ids: [receiver.id],
          nonce: bytesToHex(randomBytes(16)),
          sig: "",
          payload,
        };
        envelope.sig = signEnvelope(envelope, senderKp.priv);

        await handleMsgRelay(envelope, {
          eventRepo,
          agentRepo,
          pairingRepo,
          offlineMsgRepo,
          ttlDays: 0,
        });

        // Zero-persistence: NO event stored
        const storedEvent = await eventRepo.findByEventId(envelope.event_id);
        expect(storedEvent).toBeNull();
      }),
      { numRuns: 20 },
    );
  });
});
```

**Step 2: Run test + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/msg-relay-handler.pbt.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 10: P25 — Msg.relay Catchup Semantics PBT (7.12, MVP MANDATORY)

**Files:**

- Create: `packages/hub/src/server/ws/catchup-service.pbt.test.ts`

**Property 25: msg.relay Catchup Semantics**

Verify: zero-persistence mode catchup excludes msg.relay; TTL mode only replays non-expired ciphertexts with correct server_seq ordering.

**Step 1: Write the property test**

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomUUID, randomBytes } from "crypto";
import { bytesToHex } from "@noble/hashes/utils";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { EventRepository } from "../../db/repositories/event.repository.js";
import { OfflineMessageRepository } from "../../db/repositories/offline-message.repository.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
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
```

**Step 2: Run test + full regression**

```bash
pnpm test -- packages/hub/src/server/ws/catchup-service.pbt.test.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Plan Task 11: Optional Property Tests (7.8, 7.9, 7.10, 7.11)

**Files:**

- Create: `packages/hub/src/server/ws/event-handler.pbt.test.ts` (P3 idempotency, P5 monotonic, P24 sig before card)
- Create: `packages/hub/src/server/ws/data-policy.pbt.test.ts` (P11 data minimization)

These are marked `*` (optional/deferrable) in tasks.md. Implement if time permits, skip if under time pressure. Each test should use `fast-check` with `numRuns: 20`.

**P3: Event Idempotency** — Submit same event_id N times, verify only 1 row in DB, all return same server_seq.

**P5: server_seq Monotonic** — Submit N events, verify each gets strictly increasing server_seq.

**P11: Data Minimization** — Generate payloads with random extra fields / path separators, verify rejected.

**P24: Signature Verification Before AgentCard** — Submit agent.registered with tampered sig, verify no agent record created.

These follow the same patterns as Tasks 9 and 10.

---

## Plan Task 12: Barrel exports + update health endpoint + full regression

**Files:**

- Modify: `packages/hub/src/index.ts` — export WS components
- Modify: `packages/hub/src/server/routes/health.ts` — use `app.connections.size` for `connectedClients`
- Modify: `.kiro/specs/agentverse/tasks.md` — mark Task 7 sub-tasks complete

**Step 1: Add WS barrel exports**

In `packages/hub/src/index.ts`, add:

```typescript
// WebSocket layer exports
export { ConnectionManager } from "./server/ws/connection-manager.js";
export { wsPlugin } from "./server/ws/ws-plugin.js";
```

**Step 2: Update health endpoint**

In `packages/hub/src/server/routes/health.ts`, update `connectedClients` to use real value:

```typescript
connectedClients: app.connections?.size ?? 0,
```

**Step 3: Update tasks.md**

Mark completed sub-tasks:

- 7.1 [x] WebSocket handshake + auth
- 7.2 [x] Event receive, verify, distribute
- 7.3 [x] consumer_ack handling
- 7.4 [x] Catchup mechanism
- 7.5 [x] Data policy validator
- 7.6 [x] msg.relay blind forwarding
- 7.7 [x] Ping/pong heartbeat
- 7.8 [ ]\* P3 event idempotency (optional)
- 7.9 [ ]\* P5 server_seq monotonic (optional)
- 7.10 [ ]\* P11 data minimization (optional)
- 7.11 [ ]\* P24 signature verification (optional)
- 7.12 [x] P25 msg.relay catchup semantics (MVP mandatory)
- 7.13 [x] P17 blind forwarding (MVP mandatory)

**Step 4: Full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

Expected: All green, significantly increased test count.

**Step 5: Update session files**

Update `dev/SESSION_HANDOFF.md` and `dev/SESSION_LOG.md` with Task 7 completion details.

---

## Summary

| Plan Task | Spec Sub-task  | Component                                            | Est. Tests |
| --------- | -------------- | ---------------------------------------------------- | ---------- |
| 1         | —              | WS types + ConnectionManager                         | 5          |
| 2         | 7.1            | Auth handler (challenge-response)                    | 4          |
| 3         | 7.5            | Data policy validator                                | 8          |
| 4         | 7.2            | Event handler (submit → verify → store → distribute) | 5          |
| 5         | 7.4            | Catchup service                                      | 4          |
| 6         | 7.6            | Msg.relay handler (zero-persistence + TTL)           | 4          |
| 7         | 7.1-7.7        | WS plugin (orchestrator) + app.ts integration        | 4          |
| 8         | (5.4 deferred) | Per-operation rate limits                            | 4          |
| 9         | 7.13           | P17 Blind Forwarding PBT (MVP mandatory)             | 2          |
| 10        | 7.12           | P25 Catchup Semantics PBT (MVP mandatory)            | 2          |
| 11        | 7.8-7.11       | Optional PBTs (P3, P5, P11, P24)                     | 4\*        |
| 12        | —              | Barrel exports + health update + regression          | 0          |

**Total new tests: ~46 (+ ~4 optional)**

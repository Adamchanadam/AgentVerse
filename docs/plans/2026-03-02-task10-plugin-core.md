# Task 10: Plugin Core Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Plugin-side core modules: manifest, WebSocket connection manager (with exponential backoff), event deduplication cache, cursor manager, and event-to-channel mapper with Social Agent routing.

**Architecture:** The Plugin connects to Hub via WebSocket, authenticates with challenge-response (Ed25519), receives events, deduplicates them, maps them to OpenClaw channel inbound messages routed to agentId=social, and manages a persistent cursor (last_seen_server_seq) driven only by consumer_ack. The `ws` library is used for the client-side WebSocket. All modules are pure TypeScript with no external state dependencies (except file I/O for cursor persistence). Tests use Vitest + fast-check; no pg-mem needed on the plugin side.

**Tech Stack:** TypeScript, Vitest, fast-check, ws (WebSocket client), @agentverse/shared (types + signing)

---

### Task 1: Plugin Manifest + configSchema (10.1)

**Files:**

- Create: `packages/plugin/openclaw.plugin.json`
- Create: `packages/plugin/src/config.ts`
- Create: `packages/plugin/src/config.test.ts`
- Modify: `packages/plugin/src/index.ts` (add exports)

**Step 1: Create the plugin manifest JSON**

```json
{
  "id": "agentverse",
  "name": "AgentVerse",
  "version": "0.0.1",
  "channels": ["agentverse"],
  "configSchema": {
    "type": "object",
    "required": ["hubUrl"],
    "properties": {
      "hubUrl": {
        "type": "string",
        "description": "WebSocket URL of the AgentVerse Hub",
        "default": "ws://localhost:3000/ws"
      },
      "identityKeyPath": {
        "type": "string",
        "description": "Path to Ed25519 identity key file",
        "sensitive": false
      },
      "publicFields": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Agent fields visible to paired agents",
        "default": ["display_name", "persona_tags"]
      }
    },
    "uiHints": {
      "hubUrl": { "label": "Hub URL", "placeholder": "ws://localhost:3000/ws" },
      "identityKeyPath": {
        "label": "Identity Key Path",
        "placeholder": "~/.openclaw/agentverse/identity.key"
      },
      "publicFields": { "label": "Public Fields" }
    }
  }
}
```

**Step 2: Create config.ts with Zod validation**

```typescript
import { z } from "zod";

export const PluginConfigSchema = z.object({
  hubUrl: z.string().url().default("ws://localhost:3000/ws"),
  identityKeyPath: z.string().optional(),
  publicFields: z.array(z.string()).default(["display_name", "persona_tags"]),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export function parseConfig(raw: unknown): PluginConfig {
  return PluginConfigSchema.parse(raw);
}
```

**Step 3: Write tests for config validation**

Tests: valid config, missing hubUrl uses default, invalid hubUrl rejected, publicFields defaults.

**Step 4: Run tests**

Run: `cd D:/_Adam_Projects/OpenClaw && npx vitest run packages/plugin/src/config.test.ts`

**Step 5: Update index.ts barrel exports**

Add: `export { PluginConfigSchema, parseConfig, type PluginConfig } from "./config.js";`
Keep: `export { IdentityManager } from "./identity.js";`

**Step 6: Commit**

---

### Task 2: Exponential Backoff Calculator (10.2 prerequisite)

**Files:**

- Create: `packages/plugin/src/backoff.ts`
- Create: `packages/plugin/src/backoff.test.ts`
- Modify: `packages/plugin/src/index.ts` (add export)

**Step 1: Implement the backoff calculator**

Pure function, no side effects. Formula: `min(1000 * 2^(attempt-1), 60000) + jitter`.

```typescript
const BASE_MS = 1000;
const MAX_MS = 60000;

export function calculateBackoff(attempt: number, jitterFn?: () => number): number {
  const delay = Math.min(BASE_MS * Math.pow(2, attempt - 1), MAX_MS);
  const jitter = jitterFn ? jitterFn() : Math.random() * delay * 0.1;
  return Math.floor(delay + jitter);
}
```

**Step 2: Write unit tests**

- attempt=1 → ~1000ms
- attempt=2 → ~2000ms
- attempt=6 → ~32000ms
- attempt=7+ → capped at 60000ms
- jitter is additive, never negative
- zero-jitter function produces exact values

**Step 3: Run tests, commit**

---

### Task 3: P7 PBT — Exponential Backoff (10.3)

**Files:**

- Create: `packages/plugin/src/backoff.pbt.test.ts`

**Step 1: Write P7 property test**

```typescript
fc.assert(
  fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
    const delay = calculateBackoff(attempt, () => 0); // zero jitter
    const expected = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
    expect(delay).toBe(expected);
  }),
  { numRuns: 100 },
);
```

Additional properties:

- With jitter: delay >= base delay (jitter is non-negative)
- Delay is always <= MAX_MS + max_jitter
- Delay is always >= BASE_MS for attempt >= 1

**Step 2: Run tests, commit**

---

### Task 4: EventDeduplicationCache (10.4)

**Files:**

- Create: `packages/plugin/src/dedup-cache.ts`
- Create: `packages/plugin/src/dedup-cache.test.ts`
- Modify: `packages/plugin/src/index.ts`

**Step 1: Implement dedup cache**

Time-window + LRU approach. Simple Map with timestamps.

```typescript
export class EventDeduplicationCache {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly seen = new Map<string, number>(); // event_id → timestamp

  constructor(maxSize = 10000, ttlMs = 300_000) {
    /* 5 min default */
  }

  /** Returns true if the event_id is new (not seen before / expired). */
  check(eventId: string): boolean {
    this.evictExpired();
    if (this.seen.has(eventId)) return false;
    if (this.seen.size >= this.maxSize) this.evictOldest();
    this.seen.set(eventId, Date.now());
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}
```

**Step 2: Write unit tests**

- New event_id returns true
- Duplicate event_id returns false
- Expired event_id returns true again (after TTL)
- LRU eviction when maxSize reached
- size getter

**Step 3: Run tests, commit**

---

### Task 5: P4 PBT — Event Deduplication (10.5)

**Files:**

- Create: `packages/plugin/src/dedup-cache.pbt.test.ts`

**Step 1: Write P4 property test**

- Random event_ids, each checked twice → first true, second false
- Random set of N unique ids → all return true on first check
- Duplicate subset → those return false

**Step 2: Run tests, commit**

---

### Task 6: ServerSeqCursorManager (10.6)

**Files:**

- Create: `packages/plugin/src/cursor-manager.ts`
- Create: `packages/plugin/src/cursor-manager.test.ts`
- Modify: `packages/plugin/src/index.ts`

**Step 1: Implement cursor manager**

Key invariant: **cursor ONLY advances on consumer_ack, NEVER on submit_result**.

```typescript
export class ServerSeqCursorManager {
  private cursor: bigint;
  private readonly storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.cursor = this.loadFromDisk();
  }

  /** Current cursor value (bigint as string). */
  get current(): string {
    return this.cursor.toString();
  }

  /**
   * Advance cursor after a successful consumer_ack.
   * Only advances if newSeq > current (monotonic).
   */
  ack(serverSeq: string): void {
    const newSeq = BigInt(serverSeq);
    if (newSeq > this.cursor) {
      this.cursor = newSeq;
      this.saveToDisk();
    }
  }

  /** Explicitly does NOT affect cursor. */
  onSubmitResult(_serverSeq: string): void {
    // No-op by design. submit_result does NOT advance cursor.
  }
}
```

Storage: `~/.openclaw/agentverse/cursor.dat` (simple text file with bigint string).

**Step 2: Write unit tests**

- Initial value is "0" when no file
- ack() advances cursor forward
- ack() ignores lower/equal seq (monotonic)
- onSubmitResult() does NOT change cursor
- Persistence: ack → reload → cursor preserved

**Step 3: Run tests, commit**

---

### Task 7: P8 PBT — Cursor Only Advances on consumer_ack (10.7, MVP mandatory)

**Files:**

- Create: `packages/plugin/src/cursor-manager.pbt.test.ts`

**Step 1: Write P8 property test**

Strategy: Generate random interleaved sequences of `ack(seq)` and `submitResult(seq)` operations. After all operations, cursor must equal the maximum seq from ack calls only (never from submitResult).

```typescript
type Op = { type: "ack"; seq: string } | { type: "submit_result"; seq: string };

fc.assert(
  fc.asyncProperty(
    fc.array(
      fc.oneof(
        fc
          .bigInt({ min: 1n, max: 10000n })
          .map((n) => ({ type: "ack" as const, seq: n.toString() })),
        fc
          .bigInt({ min: 1n, max: 10000n })
          .map((n) => ({ type: "submit_result" as const, seq: n.toString() })),
      ),
      { minLength: 1, maxLength: 50 },
    ),
    async (ops) => {
      // Apply all ops, track expected max ack
      // Verify cursor === max of ack seqs (or "0" if no acks)
    },
  ),
  { numRuns: 100 },
);
```

**Step 2: Run tests, commit**

---

### Task 8: WebSocketConnectionManager (10.2)

**Files:**

- Create: `packages/plugin/src/ws-connection-manager.ts`
- Create: `packages/plugin/src/ws-connection-manager.test.ts`
- Modify: `packages/plugin/src/index.ts`
- Modify: `packages/plugin/package.json` (add `ws` dependency)

**Step 1: Add ws dependency**

```bash
cd packages/plugin && pnpm add ws && pnpm add -D @types/ws
```

**Step 2: Implement WebSocketConnectionManager**

EventEmitter-based class that:

1. Connects to Hub via `ws`
2. Handles challenge-response auth (receive challenge → sign nonce → send auth)
3. Reconnects with exponential backoff on disconnect
4. Sends `last_seen_server_seq` on reconnect for catchup
5. Emits events: `connected`, `disconnected`, `reconnecting`, `frame`, `error`
6. Provides `send(frame)`, `close()`, `state` getter

```typescript
import { EventEmitter } from "events";
import WebSocket from "ws";
import type { WsFrame } from "@agentverse/shared";
import { IdentityManager } from "./identity.js";
import { calculateBackoff } from "./backoff.js";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting";

export class WebSocketConnectionManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = "disconnected";
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private challengeNonce: string | null = null;

  constructor(
    private readonly hubUrl: string,
    private readonly identity: IdentityManager,
    private readonly getLastSeq: () => string,
  ) {
    super();
  }

  get state(): ConnectionState {
    return this._state;
  }

  connect(): void {
    /* initiate WS connection */
  }
  send(frame: WsFrame): void {
    /* JSON.stringify and send */
  }
  close(): void {
    /* clean shutdown, no reconnect */
  }

  private handleMessage(data: string): void {
    const frame = JSON.parse(data) as WsFrame;
    switch (frame.type) {
      case "challenge":
        this.handleChallenge(frame.nonce);
        break;
      case "auth_ok":
        this.handleAuthOk();
        break;
      case "auth_error":
        this.handleAuthError(frame.error);
        break;
      default:
        this.emit("frame", frame);
        break;
    }
  }

  private handleChallenge(nonce: string): void {
    this._state = "authenticating";
    const sig = this.identity.sign(hexToBytes(nonce));
    const authFrame: WsFrame = {
      type: "auth",
      payload: {
        pubkey: this.identity.getPublicKeyHex(),
        sig,
        last_seen_server_seq: this.getLastSeq(),
      },
    };
    this.send(authFrame);
  }

  private handleAuthOk(): void {
    this._state = "connected";
    this.attempt = 0;
    this.emit("connected");
  }

  private scheduleReconnect(): void {
    this.attempt++;
    this._state = "reconnecting";
    const delay = calculateBackoff(this.attempt);
    this.emit("reconnecting", { attempt: this.attempt, delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
```

**Step 3: Write unit tests**

Testing approach: mock the WebSocket constructor. Don't start a real server — test the state machine logic.

- `connect()` sets state to "connecting"
- `handleChallenge()` signs nonce and sends auth frame
- `handleAuthOk()` sets state to "connected", resets attempt counter
- `close()` prevents reconnection
- After disconnect, `scheduleReconnect()` is called with increasing delays
- `last_seen_server_seq` is included in auth frame

**Step 4: Run tests, commit**

---

### Task 9: EventToChannelMapper + Social Agent Routing (10.8)

**Files:**

- Create: `packages/plugin/src/event-mapper.ts`
- Create: `packages/plugin/src/event-mapper.test.ts`
- Modify: `packages/plugin/src/index.ts`

**Step 1: Implement EventToChannelMapper**

Maps MVP event types to OpenClaw channel inbound message format. All routed to agentId=social.

```typescript
import type { EventEnvelope, EventType } from "@agentverse/shared";

export interface ChannelInboundMessage {
  agentId: string;
  channel: string;
  type: string;
  payload: Record<string, unknown>;
  serverSeq: string;
}

const MVP_EVENT_TYPES: Set<string> = new Set([
  "pair.requested",
  "pair.approved",
  "pair.revoked",
  "msg.relay",
]);

export function mapEventToChannel(
  envelope: EventEnvelope,
  serverSeq: string,
): ChannelInboundMessage | null {
  if (!MVP_EVENT_TYPES.has(envelope.event_type)) {
    console.warn(`[agentverse] Unknown event type '${envelope.event_type}', discarding`);
    return null;
  }
  return {
    agentId: "social",
    channel: "agentverse",
    type: envelope.event_type,
    payload: envelope.payload as unknown as Record<string, unknown>,
    serverSeq,
  };
}

export function validateRouting(agentId: string): boolean {
  return agentId === "social";
}
```

**Step 2: Write unit tests**

- pair.requested → routed to social, channel=agentverse
- pair.approved → routed to social
- pair.revoked → routed to social
- msg.relay → routed to social
- Unknown event type → returns null, logs warning
- agent.registered/agent.updated → returns null (not in MVP routing set for channel)
- validateRouting("social") → true
- validateRouting("other") → false

**Step 3: Run tests, commit**

---

### Task 10: P18 + P19 + P20 PBTs — Social Agent Routing (10.9, 10.10, 10.11)

**Files:**

- Create: `packages/plugin/src/event-mapper.pbt.test.ts`

**Step 1: Write P18 — Social Agent Routing Invariant**

All MVP event types are always routed to agentId=social and only to that agent.

**Step 2: Write P19 — Event Type Mapping Completeness**

All 4 MVP event types produce non-null ChannelInboundMessage with correct type field.

**Step 3: Write P20 — Unknown Event Type Graceful Handling**

Random non-MVP event_type strings → returns null, no exception thrown.

**Step 4: Run tests, commit**

---

### Task 11: Social Agent Config Check (10.12)

**Files:**

- Create: `packages/plugin/src/social-agent-check.ts`
- Create: `packages/plugin/src/social-agent-check.test.ts`
- Modify: `packages/plugin/src/index.ts`

**Step 1: Implement printSuggestedConfig()**

```typescript
export interface OpenClawConfig {
  agents?: Array<{
    id: string;
    tools?: { deny?: string[] };
  }>;
}

const REQUIRED_DENY = ["file_write", "shell_exec", "network_outbound"];

export function checkSocialAgentConfig(config: OpenClawConfig): {
  status: "ok" | "missing" | "incomplete";
  message: string;
} {
  const social = config.agents?.find((a) => a.id === "social");
  if (!social) {
    return { status: "missing", message: printSuggestedConfig() };
  }
  const deny = social.tools?.deny ?? [];
  const missing = REQUIRED_DENY.filter((d) => !deny.includes(d));
  if (missing.length > 0) {
    return {
      status: "incomplete",
      message: `Warning: social agent missing deny items: ${missing.join(", ")}`,
    };
  }
  return { status: "ok", message: "Social agent configuration is valid" };
}

export function printSuggestedConfig(): string {
  return `
Suggested configuration for OpenClaw:

{
  "agents": [
    {
      "id": "social",
      "tools": {
        "deny": ["file_write", "shell_exec", "network_outbound"]
      }
    }
  ]
}
`.trim();
}
```

**Step 2: Write unit tests**

- No agents → status "missing" with suggested config
- Social exists with full deny → status "ok"
- Social exists with partial deny → status "incomplete" with missing items
- Social exists with no deny → lists all missing

**Step 3: Run tests, commit**

---

### Task 12: Final barrel exports + regression + docs update

**Files:**

- Modify: `packages/plugin/src/index.ts` (ensure all exports)
- Modify: `.kiro/specs/agentverse/tasks.md` (mark 10.1–10.12 as [x])
- Modify: `dev/SESSION_HANDOFF.md`
- Modify: `dev/SESSION_LOG.md`

**Step 1: Finalize index.ts**

```typescript
export { IdentityManager } from "./identity.js";
export { PluginConfigSchema, parseConfig, type PluginConfig } from "./config.js";
export { calculateBackoff } from "./backoff.js";
export { EventDeduplicationCache } from "./dedup-cache.js";
export { ServerSeqCursorManager } from "./cursor-manager.js";
export { WebSocketConnectionManager, type ConnectionState } from "./ws-connection-manager.js";
export { mapEventToChannel, validateRouting, type ChannelInboundMessage } from "./event-mapper.js";
export { checkSocialAgentConfig, printSuggestedConfig } from "./social-agent-check.js";
```

**Step 2: Run full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

**Step 3: Update tasks.md, SESSION_HANDOFF.md, SESSION_LOG.md**

**Step 4: Commit**

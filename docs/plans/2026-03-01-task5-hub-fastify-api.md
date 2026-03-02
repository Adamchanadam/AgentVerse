# Task 5: Hub Fastify REST API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build the Fastify REST API skeleton for AgentVerse Hub: env config, `/api/health`, CRUD endpoints for agents/pairings/assets, JWT session auth middleware, and global rate limiting.

**Architecture:** `buildApp(config, db)` factory with dependency injection — all Fastify plugins and routes registered inside; `Fastify.inject()` used for all HTTP tests (no real server startup needed). Env config is parsed eagerly with explicit error on missing required vars. All endpoints except `/api/health` and `/api/assets/:pack/*` require a Bearer JWT in the `Authorization` header.

**Tech Stack:** `fastify@^5`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/sensible`; Vitest with `app.inject()` for HTTP tests; existing `createTestDb()` + `AgentRepository`/`PairingRepository` from Task 4.

**Spec SSOT:** `.kiro/specs/agentverse/tasks.md` §5; requirements 5.4, 6.2, 6.3, 11.1, 11.3, 11.4, 23.3, 23.4

---

## Context for the implementer

You are implementing Task 5 of the AgentVerse Hub (`packages/hub`). The DB layer (repositories, pg-mem test helper) was completed in Task 4 — do NOT modify existing repository files except to add `findPaginated` to `AgentRepository` (Plan Task 5 below).

Key files you will need to read first:

- `packages/hub/src/db/index.ts` — `Db` type and `createDb`
- `packages/hub/src/db/repositories/agent.repository.ts` — `AgentRepository`
- `packages/hub/src/db/repositories/pairing.repository.ts` — `PairingRepository`
- `packages/hub/src/db/test-helpers/setup.ts` — `createTestDb()`
- `packages/hub/src/db/schema.ts` — `Agent`, `Pairing` types

Baseline before starting: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` must be ALL GREEN (126/126 tests).

---

## Plan Task 1: Install Fastify dependencies

**Files:**

- Modify: `packages/hub/package.json`

**Step 1: Add Fastify and plugins as dependencies**

```bash
cd D:\_Adam_Projects\OpenClaw
pnpm add fastify @fastify/cors @fastify/jwt @fastify/rate-limit @fastify/static @fastify/sensible --filter @agentverse/hub
```

**Step 2: Verify installation**

```bash
pnpm install
pnpm typecheck
```

Expected: exit 0. `packages/hub/package.json` should now have `fastify`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/sensible` in `dependencies`.

**Step 3: Commit**

```bash
git add packages/hub/package.json pnpm-lock.yaml
git commit -m "chore(hub): add fastify and plugin dependencies"
```

---

## Plan Task 2: HubConfig env parsing

**Files:**

- Create: `packages/hub/src/env.ts`
- Create: `packages/hub/src/env.test.ts`

**Step 1: Write the failing tests**

Create `packages/hub/src/env.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  const base = { DATABASE_URL: "postgres://localhost/test", JWT_SECRET: "s3cr3t" };

  it("returns defaults for optional fields", () => {
    const cfg = parseEnv(base);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.CORS_ORIGIN).toBe("*");
    expect(cfg.RATE_LIMIT_MAX).toBe(100);
    expect(cfg.MSG_RELAY_TTL_DAYS).toBe(0);
  });

  it("throws if DATABASE_URL is missing", () => {
    expect(() => parseEnv({ JWT_SECRET: "s3cr3t" })).toThrow("DATABASE_URL");
  });

  it("throws if JWT_SECRET is missing", () => {
    expect(() => parseEnv({ DATABASE_URL: "postgres://x" })).toThrow("JWT_SECRET");
  });

  it("parses custom PORT and RATE_LIMIT_MAX", () => {
    const cfg = parseEnv({ ...base, PORT: "4000", RATE_LIMIT_MAX: "50" });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.RATE_LIMIT_MAX).toBe(50);
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
pnpm test --reporter=verbose 2>&1 | grep -A5 "parseEnv"
```

Expected: `Cannot find module './env.js'`

**Step 3: Implement `packages/hub/src/env.ts`**

```typescript
export interface HubConfig {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** Max requests per IP per minute for general REST endpoints. Default: 100 */
  RATE_LIMIT_MAX: number;
  /** Days to retain offline messages (TTL mode). 0 = disabled (zero-drop mode). */
  MSG_RELAY_TTL_DAYS: number;
}

export function parseEnv(env: Record<string, string | undefined> = process.env): HubConfig {
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

  const JWT_SECRET = env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

  return {
    PORT: parseInt(env.PORT ?? "3000", 10),
    DATABASE_URL,
    JWT_SECRET,
    CORS_ORIGIN: env.CORS_ORIGIN ?? "*",
    RATE_LIMIT_MAX: parseInt(env.RATE_LIMIT_MAX ?? "100", 10),
    MSG_RELAY_TTL_DAYS: parseInt(env.MSG_RELAY_TTL_DAYS ?? "0", 10),
  };
}
```

**Step 4: Run tests — expect PASS**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(parseEnv|PASS|FAIL)"
```

Expected: 4 tests pass for `parseEnv`.

**Step 5: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 6: Commit**

```bash
git add packages/hub/src/env.ts packages/hub/src/env.test.ts
git commit -m "feat(hub): add HubConfig env parsing with required field validation"
```

---

## Plan Task 3: Fastify app factory + health endpoint

**Files:**

- Create: `packages/hub/src/server/app.ts`
- Create: `packages/hub/src/server/routes/health.ts`
- Create: `packages/hub/src/server/routes/health.test.ts`

**Step 1: Write the failing test**

Create `packages/hub/src/server/routes/health.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.connectedClients).toBe("number");
    expect(typeof body.eventsPerMinute).toBe("number");
    expect(typeof body.errorRate).toBe("number");
  });

  it("responds to CORS preflight", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/health",
      headers: {
        origin: "http://localhost:3001",
        "access-control-request-method": "GET",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
```

**Step 2: Create `packages/hub/src/server/test-config.ts`**

```typescript
import type { HubConfig } from "../env.js";

/** Minimal config for use in tests. Uses a distinct low rate limit for rate-limit tests. */
export const TEST_CONFIG: HubConfig = {
  PORT: 3000,
  DATABASE_URL: "postgres://localhost/test",
  JWT_SECRET: "test-secret-32-chars-minimum-pad",
  CORS_ORIGIN: "*",
  RATE_LIMIT_MAX: 1000, // high so normal tests don't hit limits
  MSG_RELAY_TTL_DAYS: 0,
};
```

**Step 3: Create `packages/hub/src/server/routes/health.ts`**

```typescript
import type { FastifyInstance } from "fastify";

interface HealthReply {
  status: "ok";
  connectedClients: number;
  eventsPerMinute: number;
  errorRate: number;
}

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthReply }>("/api/health", async () => ({
    status: "ok",
    connectedClients: 0, // placeholder until WS server (Task 7) is wired
    eventsPerMinute: 0, // placeholder
    errorRate: 0, // placeholder
  }));
}
```

**Step 4: Create `packages/hub/src/server/app.ts`**

```typescript
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import type { HubConfig } from "../env.js";
import type { Db } from "../db/index.js";
import { healthRoute } from "./routes/health.js";

export function buildApp(config: HubConfig, db: Db): FastifyInstance {
  const app = Fastify({ logger: false });

  void app.register(cors, { origin: config.CORS_ORIGIN });
  void app.register(sensible);

  // Store config + db on app instance for route plugins
  app.decorate("config", config);
  app.decorate("db", db);

  void app.register(healthRoute);

  return app;
}

// TypeScript augmentation so app.config / app.db resolve correctly
declare module "fastify" {
  interface FastifyInstance {
    config: HubConfig;
    db: Db;
  }
}
```

**Step 5: Run tests — expect PASS**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(health|PASS|FAIL)"
```

Expected: 2 health tests pass.

**Step 6: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 7: Commit**

```bash
git add packages/hub/src/server/
git commit -m "feat(hub): add Fastify app factory with health endpoint"
```

---

## Plan Task 4: JWT auth plugin

**Files:**

- Create: `packages/hub/src/server/plugins/auth.ts`
- Create: `packages/hub/src/server/plugins/auth.test.ts`

**Step 1: Write the failing test**

Create `packages/hub/src/server/plugins/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { authPlugin } from "./auth.js";
import { TEST_CONFIG } from "../test-config.js";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate("config", TEST_CONFIG);
  void app.register(jwt, { secret: TEST_CONFIG.JWT_SECRET });
  void app.register(authPlugin);
  // A protected test route
  app.get("/protected", { preHandler: app.authenticate }, async () => ({ ok: true }));
  return app;
}

describe("authPlugin", () => {
  it("returns 401 without a token", async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with a valid Bearer JWT", async () => {
    const app = buildTestApp();
    await app.ready();
    const token = app.jwt.sign({ pubkey: "abc123" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 with a token signed by a different secret", async () => {
    const app = buildTestApp();
    const wrongApp = Fastify({ logger: false });
    void wrongApp.register(jwt, { secret: "wrong-secret-do-not-use" });
    await wrongApp.ready();
    const badToken = wrongApp.jwt.sign({ pubkey: "eve" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${badToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

**Step 2: Create `packages/hub/src/server/plugins/auth.ts`**

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "@fastify/jwt";

export async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(jwt, { secret: app.config.JWT_SECRET });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        await reply.status(401).send({ error: "Unauthorized" });
      }
    },
  );
}

// TypeScript augmentation
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
```

**Important:** The `declare module "fastify"` block for `authenticate` is already added in `auth.ts`. Do NOT duplicate it in `app.ts` — TypeScript merges module augmentations across files.

**Step 3: Register authPlugin in `app.ts`**

In `packages/hub/src/server/app.ts`, add after the cors/sensible imports and registrations:

```typescript
import { authPlugin } from "./plugins/auth.js";
// ...inside buildApp, after sensible:
void app.register(authPlugin);
```

Remove the `authenticate` augmentation from `app.ts` (it's now in `auth.ts`).

**Step 4: Run tests — expect PASS (5 total: 2 health + 3 auth)**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(auth|health|Tests )"
```

**Step 5: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 6: Commit**

```bash
git add packages/hub/src/server/plugins/
git commit -m "feat(hub): add JWT auth plugin with authenticate decorator"
```

---

## Plan Task 5: AgentRepository.findPaginated + GET /api/agents endpoints

**Files:**

- Modify: `packages/hub/src/db/repositories/agent.repository.ts` (add `findPaginated`)
- Modify: `packages/hub/src/db/repositories/agent.repository.test.ts` (add test)
- Create: `packages/hub/src/server/routes/agents.ts`
- Create: `packages/hub/src/server/routes/agents.test.ts`

**Step 1: Add `findPaginated` method — write the failing test first**

In `packages/hub/src/db/repositories/agent.repository.test.ts`, add inside the existing describe block:

```typescript
describe("findPaginated", () => {
  it("returns public agents with limit and offset", async () => {
    const db = createTestDb();
    const repo = new AgentRepository(db);
    // Seed 3 public agents
    for (let i = 1; i <= 3; i++) {
      await repo.upsert({
        id: randomUUID(),
        displayName: `Agent ${i}`,
        personaTags: [],
        capabilities: [],
        visibility: "public",
        pubkey: `pubkey-paginate-${i}`,
        level: 1,
        badges: [],
      });
    }
    const page1 = await repo.findPaginated(undefined, 2, 0);
    expect(page1).toHaveLength(2);
    const page2 = await repo.findPaginated(undefined, 2, 2);
    expect(page2).toHaveLength(1);
  });

  it("filters by query string", async () => {
    const db = createTestDb();
    const repo = new AgentRepository(db);
    await repo.upsert({
      id: randomUUID(),
      displayName: "Dragon Mage",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: "pubkey-dragon",
      level: 1,
      badges: [],
    });
    await repo.upsert({
      id: randomUUID(),
      displayName: "Healer Bot",
      personaTags: [],
      capabilities: [],
      visibility: "public",
      pubkey: "pubkey-healer",
      level: 1,
      badges: [],
    });
    const results = await repo.findPaginated("dragon", 10, 0);
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe("Dragon Mage");
  });
});
```

**Step 2: Add `findPaginated` to `agent.repository.ts`**

Add this method to `AgentRepository` class (after `search`):

```typescript
async findPaginated(
  query: string | undefined,
  limit: number,
  offset: number,
): Promise<Agent[]> {
  const condition = query
    ? and(eq(agents.visibility, "public"), ilike(agents.displayName, `%${query}%`))
    : eq(agents.visibility, "public");
  return this.db.select().from(agents).where(condition).limit(limit).offset(offset);
}
```

**Step 3: Write the failing HTTP tests**

Create `packages/hub/src/server/routes/agents.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { TEST_CONFIG } from "../test-config.js";

async function seedAgent(
  repo: AgentRepository,
  overrides?: Partial<{ displayName: string; pubkey: string }>,
) {
  return repo.upsert({
    id: randomUUID(),
    displayName: overrides?.displayName ?? "Test Agent",
    personaTags: ["test"],
    capabilities: [],
    visibility: "public",
    pubkey: overrides?.pubkey ?? `pk-${randomUUID()}`,
    level: 1,
    badges: [],
  });
}

function makeAuthHeader(app: ReturnType<typeof buildApp>) {
  return `Bearer ${app.jwt.sign({ pubkey: "web-user" })}`;
}

describe("GET /api/agents", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({ method: "GET", url: "/api/agents" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with agents array", async () => {
    const db = createTestDb();
    const repo = new AgentRepository(db);
    await seedAgent(repo, { displayName: "Alpha", pubkey: "pk-alpha" });
    const app = buildApp(TEST_CONFIG, db);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: makeAuthHeader(app) },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { agents: unknown[]; total: number };
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents).toHaveLength(1);
    expect(typeof body.total).toBe("number");
  });

  it("filters by q param", async () => {
    const db = createTestDb();
    const repo = new AgentRepository(db);
    await seedAgent(repo, { displayName: "Warrior", pubkey: "pk-warrior" });
    await seedAgent(repo, { displayName: "Mage", pubkey: "pk-mage" });
    const app = buildApp(TEST_CONFIG, db);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/agents?q=Warrior",
      headers: { authorization: makeAuthHeader(app) },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { agents: Array<{ displayName: string }> };
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].displayName).toBe("Warrior");
  });
});

describe("GET /api/agents/:id", () => {
  it("returns 404 for unknown id", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/nonexistent-id",
      headers: { authorization: makeAuthHeader(app) },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 with agent data for known id", async () => {
    const db = createTestDb();
    const repo = new AgentRepository(db);
    const agent = await seedAgent(repo, { displayName: "Rogue", pubkey: "pk-rogue" });
    const app = buildApp(TEST_CONFIG, db);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agent.id}`,
      headers: { authorization: makeAuthHeader(app) },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; displayName: string };
    expect(body.id).toBe(agent.id);
    expect(body.displayName).toBe("Rogue");
  });
});
```

**Step 4: Create `packages/hub/src/server/routes/agents.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { AgentRepository } from "../../db/repositories/agent.repository.js";

interface AgentListQuery {
  q?: string;
  page?: number;
  limit?: number;
}

export async function agentsRoute(app: FastifyInstance): Promise<void> {
  const repo = new AgentRepository(app.db);

  app.get<{ Querystring: AgentListQuery }>(
    "/api/agents",
    { preHandler: app.authenticate },
    async (request) => {
      const { q, page = 1, limit = 20 } = request.query;
      const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
      const safeOffset = (Math.max(Number(page), 1) - 1) * safeLimit;
      const agents = await repo.findPaginated(q, safeLimit, safeOffset);
      return { agents, total: agents.length, page: Number(page), limit: safeLimit };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/agents/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const agent = await repo.findById(request.params.id);
      if (!agent) return reply.status(404).send({ error: "Agent not found" });
      return agent;
    },
  );
}
```

**Step 5: Register `agentsRoute` in `app.ts`**

```typescript
import { agentsRoute } from "./routes/agents.js";
// inside buildApp, after healthRoute:
void app.register(agentsRoute);
```

**Step 6: Run tests — expect PASS**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(agent|Tests )"
```

Expected: all new tests pass. Total count increases.

**Step 7: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 8: Commit**

```bash
git add packages/hub/src/db/repositories/agent.repository.ts \
        packages/hub/src/db/repositories/agent.repository.test.ts \
        packages/hub/src/server/routes/agents.ts \
        packages/hub/src/server/routes/agents.test.ts
git commit -m "feat(hub): add agents REST endpoints (GET /api/agents, GET /api/agents/:id)"
```

---

## Plan Task 6: GET /api/pairings endpoint

**Files:**

- Create: `packages/hub/src/server/routes/pairings.ts`
- Create: `packages/hub/src/server/routes/pairings.test.ts`

**Step 1: Write the failing tests**

Create `packages/hub/src/server/routes/pairings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { AgentRepository } from "../../db/repositories/agent.repository.js";
import { PairingRepository } from "../../db/repositories/pairing.repository.js";
import { TEST_CONFIG } from "../test-config.js";

async function seedPairedAgents(db: ReturnType<typeof createTestDb>) {
  const agentRepo = new AgentRepository(db);
  const pairingRepo = new PairingRepository(db);
  const agentA = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "A",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-pair-a-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  const agentB = await agentRepo.upsert({
    id: randomUUID(),
    displayName: "B",
    personaTags: [],
    capabilities: [],
    visibility: "public",
    pubkey: `pk-pair-b-${randomUUID()}`,
    level: 1,
    badges: [],
  });
  const pairing = await pairingRepo.create(agentA.id, agentB.id);
  return { agentA, agentB, pairing };
}

describe("GET /api/pairings", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({ method: "GET", url: "/api/pairings" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with empty array when no pairings", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { pairings: unknown[] };
    expect(Array.isArray(body.pairings)).toBe(true);
  });

  it("returns pairings when they exist", async () => {
    const db = createTestDb();
    await seedPairedAgents(db);
    const app = buildApp(TEST_CONFIG, db);
    await app.ready();
    const token = app.jwt.sign({ pubkey: "web-user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { pairings: unknown[] };
    expect(body.pairings).toHaveLength(1);
  });
});
```

**Step 2: Create `packages/hub/src/server/routes/pairings.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { pairings } from "../../db/schema.js";

export async function pairingsRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/pairings", { preHandler: app.authenticate }, async () => {
    // MVP: return all pairings (Web UI sees full list; per-user filtering added in Task 14 with login)
    const rows = await app.db.select().from(pairings);
    return { pairings: rows };
  });
}
```

**Step 3: Register `pairingsRoute` in `app.ts`**

```typescript
import { pairingsRoute } from "./routes/pairings.js";
// inside buildApp:
void app.register(pairingsRoute);
```

**Step 4: Run tests**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(pairing|Tests )"
```

**Step 5: typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add packages/hub/src/server/routes/pairings.ts packages/hub/src/server/routes/pairings.test.ts
git commit -m "feat(hub): add GET /api/pairings endpoint"
```

---

## Plan Task 7: GET /api/assets/:pack/\* static file serving

**Files:**

- Create: `packages/hub/src/server/routes/assets.ts`
- Create: `packages/hub/src/server/routes/assets.test.ts`

**Step 1: Understand the assets structure**

Assets live at `packages/hub/public/assets/mvp-default/{avatars,badges,card_frames,backgrounds}/` with a `manifest.json` at the pack root. The route should serve `GET /api/assets/:pack/*` → `public/assets/:pack/*`.

**Step 2: Write the failing tests**

Create `packages/hub/src/server/routes/assets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import { TEST_CONFIG } from "../test-config.js";

describe("GET /api/assets/:pack/*", () => {
  it("returns 200 for existing manifest.json", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/mvp-default/manifest.json",
    });
    // 200 if the file exists at packages/hub/public/assets/mvp-default/manifest.json
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
  });

  it("returns 404 for non-existent pack", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/nonexistent-pack/file.json",
    });
    expect(res.statusCode).toBe(404);
  });

  it("does not require auth", async () => {
    const app = buildApp(TEST_CONFIG, createTestDb());
    // No Authorization header — should still work (assets are public)
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/mvp-default/manifest.json",
    });
    expect(res.statusCode).toBe(200);
  });
});
```

**Step 3: Read `packages/hub/public/assets/mvp-default/manifest.json` to understand its shape**

(Do this before implementing so you know what `id` field to expect in the test.)

**Step 4: Create `packages/hub/src/server/routes/assets.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import staticFiles from "@fastify/static";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Resolve from src/server/routes/ → packages/hub/public/
const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

export async function assetsRoute(app: FastifyInstance): Promise<void> {
  await app.register(staticFiles, {
    root: join(PUBLIC_DIR, "assets"),
    prefix: "/api/assets/",
    decorateReply: false, // avoid conflicts if registered multiple times
  });
}
```

**Important note on path resolution:** `__dirname` in ESM is derived via `fileURLToPath(new URL(".", import.meta.url))`. After `tsc` compiles to `dist/`, the relative path `../../..` goes from `dist/server/routes/` → `dist/` → `packages/hub/`. The `public/` directory is NOT under `dist/` — it stays at `packages/hub/public/`. Verify the path works with the inject test.

If the tests fail due to path resolution, use an absolute path relative to the monorepo root or set an env var `PUBLIC_DIR` in `HubConfig`. The safest approach: add `PUBLIC_DIR` to `HubConfig` with default `packages/hub/public` resolved relative to `process.cwd()`.

**Step 5: Register `assetsRoute` in `app.ts`**

```typescript
import { assetsRoute } from "./routes/assets.js";
// inside buildApp (register BEFORE rate-limit to skip rate-limiting for assets):
void app.register(assetsRoute);
```

**Step 6: Run tests**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(assets|Tests )"
```

**Step 7: typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add packages/hub/src/server/routes/assets.ts packages/hub/src/server/routes/assets.test.ts
git commit -m "feat(hub): add GET /api/assets/:pack/* static file serving"
```

---

## Plan Task 8: Global rate limiting plugin

**Files:**

- Create: `packages/hub/src/server/plugins/rate-limit.ts`
- Create: `packages/hub/src/server/plugins/rate-limit.test.ts`

**Step 1: Write the failing tests**

Create `packages/hub/src/server/plugins/rate-limit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import type { HubConfig } from "../../env.js";
import { TEST_CONFIG } from "../test-config.js";

/** Config with very low limit to test rate limiting without many requests */
const TIGHT_CONFIG: HubConfig = { ...TEST_CONFIG, RATE_LIMIT_MAX: 2 };

describe("rate limiting", () => {
  it("allows requests up to the limit", async () => {
    const app = buildApp(TIGHT_CONFIG, createTestDb());
    const r1 = await app.inject({ method: "GET", url: "/api/health" });
    const r2 = await app.inject({ method: "GET", url: "/api/health" });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });

  it("returns 429 after exceeding the limit", async () => {
    const app = buildApp(TIGHT_CONFIG, createTestDb());
    await app.inject({ method: "GET", url: "/api/health" });
    await app.inject({ method: "GET", url: "/api/health" });
    const r3 = await app.inject({ method: "GET", url: "/api/health" });
    expect(r3.statusCode).toBe(429);
  });

  it("sets rate limit headers on response", async () => {
    const app = buildApp(TIGHT_CONFIG, createTestDb());
    const res = await app.inject({ method: "GET", url: "/api/health" });
    // @fastify/rate-limit adds x-ratelimit-* headers
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });
});
```

**Step 2: Create `packages/hub/src/server/plugins/rate-limit.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { HubConfig } from "../../env.js";

interface RateLimitPluginOptions {
  config: HubConfig;
}

export async function rateLimitPlugin(
  app: FastifyInstance,
  opts: RateLimitPluginOptions,
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: opts.config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (req) =>
      (req.headers["x-forwarded-for"] as string | undefined) ?? req.ip ?? "unknown",
    errorResponseBuilder: (_req, context) => ({
      error: "rate_limit_exceeded",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retry_after: Math.ceil(context.ttl / 1000),
    }),
  });
}
```

**Step 3: Register `rateLimitPlugin` in `app.ts`**

In `app.ts`, import and register `rateLimitPlugin` (must be registered BEFORE routes so the global rate limit applies):

```typescript
import { rateLimitPlugin } from "./plugins/rate-limit.js";
// inside buildApp, after cors/sensible, before routes:
void app.register(rateLimitPlugin, { config });
```

**NOTE:** `@fastify/rate-limit` uses an in-process store by default. During tests, each `buildApp()` call creates a fresh store — this is intentional and correct.

**Step 4: Run tests**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "(rate.limit|Tests )"
```

**Step 5: typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add packages/hub/src/server/plugins/rate-limit.ts packages/hub/src/server/plugins/rate-limit.test.ts
git commit -m "feat(hub): add global rate limiting with configurable max via RATE_LIMIT_MAX"
```

---

## Plan Task 9: Barrel exports + full regression

**Files:**

- Modify: `packages/hub/src/index.ts`
- Modify: `packages/hub/src/server/app.ts` (verify all plugins/routes wired)

**Step 1: Verify app.ts registers all plugins and routes**

Open `packages/hub/src/server/app.ts` and confirm it registers, in order:

1. `cors`
2. `sensible`
3. `rateLimitPlugin` (must be before routes)
4. `authPlugin` (must be before protected routes)
5. `assetsRoute` (public — no auth)
6. `healthRoute` (public — no auth)
7. `agentsRoute` (protected)
8. `pairingsRoute` (protected)

**Step 2: Export `buildApp` and `HubConfig` from barrel**

In `packages/hub/src/index.ts`, add:

```typescript
export { buildApp } from "./server/app.js";
export { parseEnv, type HubConfig } from "./env.js";
```

The full `index.ts` should look like:

```typescript
// @agentverse/hub — Fastify REST API + WebSocket + DB (pure server)

// DB layer exports
export * from "./db/schema.js";
export { createDb, createDbFromUrl, type Db } from "./db/index.js";
export { AgentRepository, type AgentUpsertData } from "./db/repositories/agent.repository.js";
export { PairingRepository, PairingTransitionError } from "./db/repositories/pairing.repository.js";
export { EventRepository, type EventInsertData } from "./db/repositories/event.repository.js";
export {
  OfflineMessageRepository,
  type OfflineMessageInsertData,
} from "./db/repositories/offline-message.repository.js";

// Server layer exports
export { buildApp } from "./server/app.js";
export { parseEnv, type HubConfig } from "./env.js";
```

**Step 3: Run full regression**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

Expected:

- typecheck: 0 errors
- lint: 0 errors
- test: all pass (126 original + new HTTP tests)
- format:check: all clean

If format:check fails: `pnpm prettier --write packages/hub/src/`

**Step 4: Update tasks.md**

Mark tasks 5.1, 5.3, 5.4 as `[x]` in `.kiro/specs/agentverse/tasks.md`. Mark `[-] 5.` (partial, since 5.2/5.5/5.6 are optional and pending).

**Step 5: Commit**

```bash
git add packages/hub/src/index.ts packages/hub/src/server/app.ts .kiro/specs/agentverse/tasks.md
git commit -m "feat(hub): wire all REST API plugins/routes, export server layer from barrel"
```

---

## [Optional] Plan Task 10: P23 — Env config property test

> **Skip if time-constrained.** P23 is marked "可延後" in the spec.

**Files:**

- Create: `packages/hub/src/env.pbt.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseEnv } from "./env.js";

describe("Property 23: Env config — required fields", () => {
  it("always throws when DATABASE_URL is absent", () => {
    fc.assert(
      fc.property(fc.record({ JWT_SECRET: fc.string({ minLength: 1 }) }), (env) => {
        expect(() => parseEnv(env)).toThrow("DATABASE_URL");
      }),
    );
  });

  it("always throws when JWT_SECRET is absent", () => {
    fc.assert(
      fc.property(fc.record({ DATABASE_URL: fc.string({ minLength: 1 }) }), (env) => {
        expect(() => parseEnv(env)).toThrow("JWT_SECRET");
      }),
    );
  });

  it("always succeeds when both required fields present", () => {
    fc.assert(
      fc.property(
        fc.record({
          DATABASE_URL: fc.string({ minLength: 1 }),
          JWT_SECRET: fc.string({ minLength: 1 }),
        }),
        (env) => {
          expect(() => parseEnv(env)).not.toThrow();
        },
      ),
    );
  });
});
```

---

## [Optional] Plan Task 11: P12 — Rate limit property test

> **Skip if time-constrained.** P12 is marked "可延後" in the spec.

**Files:**

- Create: `packages/hub/src/server/plugins/rate-limit.pbt.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import type { HubConfig } from "../../env.js";
import { TEST_CONFIG } from "../test-config.js";

describe("Property 12: Rate limit exceeded requests are rejected", () => {
  it("for any max in [1,5]: requests[0..max-1] succeed, request[max] gets 429", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (maxRequests) => {
        const config: HubConfig = { ...TEST_CONFIG, RATE_LIMIT_MAX: maxRequests };
        const app = buildApp(config, createTestDb());
        for (let i = 0; i < maxRequests; i++) {
          const res = await app.inject({ method: "GET", url: "/api/health" });
          expect(res.statusCode).toBe(200);
        }
        const overLimit = await app.inject({ method: "GET", url: "/api/health" });
        expect(overLimit.statusCode).toBe(429);
        const body = JSON.parse(overLimit.body) as { error: string };
        expect(body.error).toBe("rate_limit_exceeded");
      }),
      { numRuns: 5 }, // keep test fast; property is deterministic
    );
  });
});
```

---

## Verification checklist before marking Task 5 complete

- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm lint` — 0 warnings/errors
- [ ] `pnpm test` — all tests pass (target: 126 + ~25 new = ~151 total)
- [ ] `pnpm format:check` — all clean
- [ ] `.kiro/specs/agentverse/tasks.md` — 5.1, 5.3, 5.4 marked `[x]`; optional 5.2/5.5/5.6 if completed
- [ ] `dev/SESSION_HANDOFF.md` and `dev/SESSION_LOG.md` updated

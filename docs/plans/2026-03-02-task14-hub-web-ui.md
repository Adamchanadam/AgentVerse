# Task 14: Hub Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first user-visible web interface — AgentDex catalog, pairing management, and session auth — on top of the existing Hub REST API.

**Architecture:** Next.js 15 App Router running as a separate service (`packages/web`) that proxies API calls to the Hub Fastify server. CSS Modules + existing CSS custom properties (`tokens.css`) for the retro BBS aesthetic. Simple secret-based auth for MVP self-hosted deployment.

**Tech Stack:** Next.js 15, React 19, CSS Modules, Vitest + React Testing Library

---

## Context for Implementer

### What Already Exists

- **Hub REST API** (Fastify, `packages/hub`):
  - `GET /api/health` — public, returns `{ status, connectedClients, eventsPerMinute, errorRate }`
  - `GET /api/agents?q=&page=&limit=` — JWT auth required, paginated agent list
  - `GET /api/agents/:id` — JWT auth required, single agent detail
  - `GET /api/pairings` — JWT auth required, pairing list (capped at 100)
  - `GET /api/assets/:pack/*` — public, static file serving
- **CSS design tokens**: `packages/web/src/styles/tokens.css` (all CSS custom properties defined)
- **Wireframe specs**: `dev/ui-ux/wireframe_specs.md` (pixel-perfect layout specs)
- **Design system**: `dev/ui-ux/design_tokens.md` (colors, fonts, spacing, shadow rules)
- **Static assets**: 10 PNGs in `packages/hub/public/assets/mvp-default/` + `manifest.json`
- **Hub auth**: `@fastify/jwt` with `JWT_SECRET` env var; routes use `app.authenticate` decorator

### What Does NOT Exist Yet (This Plan Adds)

- `POST /api/auth/token` — Hub endpoint to issue JWTs for Web UI login
- `POST /api/pairings` — Hub endpoint to create pairing requests
- `PATCH /api/pairings/:id` — Hub endpoint to approve/revoke pairings
- The entire Next.js web application

### Design Constraints (Iron Rules)

- `border-radius: 0` everywhere (sharp corners only)
- Hard shadows only: `box-shadow: Xpx Ypx 0px <color>` (zero blur)
- Background: `#0000AA` (Deep ANSI Blue) or `#000000` (Pitch Black)
- Fonts: Space Grotesk (primary), Press Start 2P (display/gaming), Fira Code (monospace)
- Accent colors: Cyan `#55FFFF`, Magenta `#FF55FF`, Yellow `#FFFF55`, Orange `#F88800`
- 8px grid spacing system
- Terminal/BBS aesthetic throughout (ASCII spinners, `[ BUTTON ]` style, `> prefix:` chat)

---

## Task 1: Next.js Project Scaffold

**Files:**

- Modify: `packages/web/package.json`
- Replace: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.ts`
- Create: `packages/web/next-env.d.ts`
- Create: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/app/page.tsx`
- Create: `packages/web/src/app/globals.css`
- Modify: `packages/web/src/styles/tokens.css` (move to `src/app/tokens.css` or keep and import)
- Modify: `package.json` (root — update typecheck script)

**Step 1: Install Next.js dependencies**

```bash
cd packages/web
pnpm add next@latest react@latest react-dom@latest
pnpm add -D @types/react @types/react-dom
```

**Step 2: Update `packages/web/package.json` scripts**

Replace the current scripts with:

```json
{
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "test": "vitest --run",
    "typecheck": "npx tsc --noEmit"
  }
}
```

Port 3001 because Hub uses 3000.

**Step 3: Replace `packages/web/tsconfig.json`**

Next.js requires specific TS settings that differ from the monorepo base. Replace entirely:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Step 4: Update root `pnpm typecheck`**

The root `tsc -b` won't work for Next.js (different module system). Update root `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc -b --force packages/shared packages/hub packages/plugin && pnpm --filter @agentverse/web typecheck"
  }
}
```

This runs `tsc -b` for the three library packages, then Next.js-specific typecheck for web.

**Step 5: Create `packages/web/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to Hub in development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

**Step 6: Create `packages/web/src/app/globals.css`**

```css
/* === AgentVerse BBS Aesthetic Reset === */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border-radius: 0; /* IRON RULE: no rounded corners */
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}

body {
  font-family: var(--font-primary);
  background-color: var(--bg-deep-ansi-blue);
  color: var(--text-primary-light);
  min-height: 100vh;
}

a {
  color: var(--accent-cyan);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* ASCII-style scrollbar */
::-webkit-scrollbar {
  width: 12px;
}
::-webkit-scrollbar-track {
  background: var(--bg-pitch-black);
}
::-webkit-scrollbar-thumb {
  background: var(--surface-gray);
  border: 2px solid var(--bg-pitch-black);
}

/* Font imports */
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Press+Start+2P&family=Fira+Code:wght@400;500&display=swap");
```

**Step 7: Create `packages/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentVerse Hub",
  description: "OpenClaw AI Agent Community & Growth Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Note: Move `tokens.css` from `src/styles/tokens.css` to `src/app/tokens.css` so it can be imported in the layout. Alternatively keep the old path and use a relative import `../styles/tokens.css`.

**Step 8: Create `packages/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "var(--font-display)",
        color: "var(--accent-cyan)",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <h1 style={{ fontSize: "16px" }}>AGENTVERSE HUB</h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text-dimmed)",
          fontSize: "14px",
        }}
      >
        {">"} SYSTEM ONLINE_
      </p>
    </main>
  );
}
```

**Step 9: Remove old `src/index.ts`**

Delete `packages/web/src/index.ts` — no longer needed (Next.js has its own entry points).

**Step 10: Verify scaffold works**

```bash
pnpm --filter @agentverse/web dev
# Expected: Next.js dev server starts on http://localhost:3001
# Browser shows "AGENTVERSE HUB" with BBS blue background
```

Then verify monorepo integration:

```bash
pnpm typecheck   # Expected: all packages pass
pnpm lint         # Expected: pass (may need eslint config for tsx)
```

**Step 11: Commit**

```bash
git add packages/web/ package.json
git commit -m "feat(web): scaffold Next.js app with BBS design tokens"
```

---

## Task 2: Design System Components

**Files:**

- Create: `packages/web/src/components/Panel.tsx` + `Panel.module.css`
- Create: `packages/web/src/components/RetroButton.tsx` + `RetroButton.module.css`
- Create: `packages/web/src/components/AsciiSpinner.tsx` + `AsciiSpinner.module.css`
- Create: `packages/web/src/components/ErrorDisplay.tsx` + `ErrorDisplay.module.css`
- Create: `packages/web/src/components/NavBar.tsx` + `NavBar.module.css`

**Step 1: Panel component (ANSI window frame)**

`Panel.tsx`:

```tsx
import styles from "./Panel.module.css";

interface PanelProps {
  title?: string;
  children: React.ReactNode;
  accentColor?: "cyan" | "magenta" | "yellow" | "white";
  className?: string;
}

export function Panel({ title, children, accentColor = "white", className }: PanelProps) {
  return (
    <div className={`${styles.panel} ${styles[accentColor]} ${className ?? ""}`}>
      {title && <div className={styles.titleBar}>{title}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

`Panel.module.css`:

```css
.panel {
  background: var(--surface-dark);
  border: var(--border-thin) solid var(--border-white);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--shadow-gray);
}
.cyan {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-cyan);
}
.magenta {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-magenta);
}
.yellow {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-yellow);
}
.white {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--shadow-gray);
}
.titleBar {
  background: var(--surface-gray);
  color: var(--text-primary-dark);
  font-family: var(--font-display);
  font-size: 10px;
  padding: var(--spacing-base);
  border-bottom: var(--border-thin) solid var(--border-white);
}
.content {
  padding: calc(var(--spacing-base) * 2);
}
```

**Step 2: RetroButton component**

`RetroButton.tsx`:

```tsx
import styles from "./RetroButton.module.css";

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "ghost";
  label: string;
}

export function RetroButton({ variant = "primary", label, ...props }: RetroButtonProps) {
  return (
    <button className={`${styles.btn} ${styles[variant]}`} {...props}>
      {"[ "}
      {label}
      {" ]"}
    </button>
  );
}
```

`RetroButton.module.css`:

```css
.btn {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: var(--spacing-base) calc(var(--spacing-base) * 2);
  border: var(--border-thin) solid var(--border-white);
  cursor: pointer;
  background: var(--bg-pitch-black);
  color: var(--text-primary-light);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--shadow-gray);
  transition: none;
}
.btn:hover {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-cyan);
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.primary {
  background: var(--surface-gray);
  color: var(--text-primary-dark);
}
.primary:hover {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-cyan);
}
.danger {
  border-color: var(--accent-magenta);
}
.danger:hover {
  color: var(--accent-magenta);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-magenta);
}
.ghost {
  background: transparent;
  border-color: var(--text-dimmed);
}
```

**Step 3: AsciiSpinner component**

`AsciiSpinner.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import styles from "./AsciiSpinner.module.css";

const FRAMES = ["[ | ]", "[ / ]", "[ - ]", "[ \\ ]"];

export function AsciiSpinner({ text = "LOADING" }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 150);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.spinner}>
      <span className={styles.frames}>{FRAMES[frame]}</span>
      <span className={styles.text}>{text}...</span>
    </div>
  );
}
```

`AsciiSpinner.module.css`:

```css
.spinner {
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  display: flex;
  gap: var(--spacing-base);
  align-items: center;
}
.frames {
  font-size: 16px;
  min-width: 48px;
  text-align: center;
}
.text {
  font-size: 12px;
  color: var(--text-dimmed);
}
```

**Step 4: ErrorDisplay component**

`ErrorDisplay.tsx`:

```tsx
import styles from "./ErrorDisplay.module.css";

interface ErrorDisplayProps {
  code?: string;
  message: string;
}

export function ErrorDisplay({ code = "0x000F", message }: ErrorDisplayProps) {
  return (
    <div className={styles.error}>
      FATAL ERROR: {code} — {message.toUpperCase()}
    </div>
  );
}
```

`ErrorDisplay.module.css`:

```css
.error {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--accent-magenta);
  background: var(--bg-pitch-black);
  border: var(--border-thin) solid var(--accent-magenta);
  padding: calc(var(--spacing-base) * 2);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-magenta);
}
```

**Step 5: NavBar component**

`NavBar.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./NavBar.module.css";

const NAV_ITEMS = [
  { href: "/agentdex", label: "AGENTDEX" },
  { href: "/pairings", label: "PAIRINGS" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>
        AGENTVERSE
      </Link>
      <div className={styles.links}>
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.link} ${pathname.startsWith(href) ? styles.active : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className={styles.spacer} />
      <Link href="/login" className={styles.link}>
        AUTH
      </Link>
    </nav>
  );
}
```

`NavBar.module.css`:

```css
.nav {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing-base) * 3);
  padding: var(--spacing-base) calc(var(--spacing-base) * 2);
  background: var(--bg-pitch-black);
  border-bottom: var(--border-thin) solid var(--border-white);
  font-family: var(--font-display);
  font-size: 10px;
}
.brand {
  color: var(--accent-cyan);
  text-decoration: none;
  font-size: 12px;
}
.links {
  display: flex;
  gap: calc(var(--spacing-base) * 2);
}
.link {
  color: var(--text-dimmed);
  text-decoration: none;
}
.link:hover {
  color: var(--text-primary-light);
}
.active {
  color: var(--accent-yellow);
}
.spacer {
  flex: 1;
}
```

**Step 6: Add NavBar to layout**

Update `src/app/layout.tsx` to include `<NavBar />` above `{children}`.

**Step 7: Verify components render**

```bash
pnpm --filter @agentverse/web dev
# Manually verify: NavBar visible, navigate to /agentdex (404 but nav works)
```

**Step 8: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat(web): add design system components (Panel, RetroButton, AsciiSpinner, ErrorDisplay, NavBar)"
```

---

## Task 3: Hub Auth Token Endpoint

**Files:**

- Modify: `packages/hub/src/env.ts` (add `HUB_ADMIN_SECRET`)
- Create: `packages/hub/src/server/routes/auth.ts`
- Create: `packages/hub/src/server/routes/auth.test.ts`
- Modify: `packages/hub/src/server/app.ts` (register auth route)

**Step 1: Write failing test for POST /api/auth/token**

`auth.test.ts` (new file in routes/):

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import { createTestDb } from "../../db/test-helpers/setup.js";
import type { HubConfig } from "../../env.js";
import type { FastifyInstance } from "fastify";

const TEST_CONFIG: HubConfig = {
  PORT: 0,
  DATABASE_URL: "memory://",
  JWT_SECRET: "test-jwt-secret",
  CORS_ORIGIN: "*",
  RATE_LIMIT_MAX: 100,
  MSG_RELAY_TTL_DAYS: 0,
  HUB_ADMIN_SECRET: "test-admin-secret",
};

describe("POST /api/auth/token", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp(TEST_CONFIG, createTestDb());
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns JWT when secret matches", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "test-admin-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  it("returns 401 when secret is wrong", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "wrong-secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when secret is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returned token works for authenticated endpoints", async () => {
    const tokenRes = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "test-admin-secret" },
    });
    const { token } = tokenRes.json();

    const agentsRes = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(agentsRes.statusCode).toBe(200);
  });
});
```

**Step 2: Run test — expect FAIL**

```bash
pnpm --filter @agentverse/hub test -- src/server/routes/auth.test.ts
# Expected: FAIL (route doesn't exist yet, HUB_ADMIN_SECRET not in HubConfig)
```

**Step 3: Add HUB_ADMIN_SECRET to env.ts**

In `packages/hub/src/env.ts`, add to `HubConfig` interface:

```typescript
HUB_ADMIN_SECRET: string;
```

In `parseEnv()`, add:

```typescript
HUB_ADMIN_SECRET: env.HUB_ADMIN_SECRET ?? "changeme",
```

**Step 4: Create auth route**

`packages/hub/src/server/routes/auth.ts`:

```typescript
import type { FastifyInstance } from "fastify";

export async function authTokenRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/token",
    {
      schema: {
        body: {
          type: "object",
          required: ["secret"],
          properties: {
            secret: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { secret } = request.body as { secret: string };
      if (secret !== app.config.HUB_ADMIN_SECRET) {
        return reply.code(401).send({ error: "Invalid secret" });
      }
      const token = app.jwt.sign({ sub: "admin", role: "admin" });
      return { token };
    },
  );
}
```

**Step 5: Register in app.ts**

Add `authTokenRoute` to the registration queue (BEFORE authPlugin, since this route is public):

```typescript
import { authTokenRoute } from "./routes/auth.js";
// ... in buildApp, after assetsRoute/healthRoute, before agentsRoute:
app.register(authTokenRoute);
```

**Step 6: Run test — expect PASS**

```bash
pnpm --filter @agentverse/hub test -- src/server/routes/auth.test.ts
# Expected: 4/4 PASS
```

**Step 7: Full Hub regression**

```bash
pnpm --filter @agentverse/hub test
# Expected: all existing tests + 4 new tests pass
```

**Step 8: Commit**

```bash
git add packages/hub/src/
git commit -m "feat(hub): add POST /api/auth/token endpoint for Web UI login"
```

---

## Task 4: Hub Pairing Write Endpoints

**Files:**

- Modify: `packages/hub/src/server/routes/pairings.ts`
- Modify: `packages/hub/src/server/routes/pairings.test.ts`

**Step 1: Write failing tests for POST and PATCH**

Add to existing `pairings.test.ts`:

```typescript
describe("POST /api/pairings", () => {
  it("creates a pending pairing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: "agent-a-id", agentBId: "agent-b-id" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.pairing).toHaveProperty("id");
    expect(body.pairing.status).toBe("pending");
  });

  it("returns 409 if pairing already exists", async () => {
    // Create first
    await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: "agent-a-id", agentBId: "agent-b-id" },
    });
    // Duplicate
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: "agent-a-id", agentBId: "agent-b-id" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pairings",
      payload: { agentAId: "agent-a-id", agentBId: "agent-b-id" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("PATCH /api/pairings/:id", () => {
  it("transitions pending to active", async () => {
    // Create pairing first
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: "agent-a-id", agentBId: "agent-b-id" },
    });
    const { pairing } = createRes.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pairing.status).toBe("active");
  });

  it("transitions active to revoked", async () => {
    // Create + approve
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers: { authorization: `Bearer ${token}` },
      payload: { agentAId: "a", agentBId: "b" },
    });
    const { pairing } = createRes.json();
    await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/pairings/${pairing.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "revoke" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pairing.status).toBe("revoked");
  });

  it("returns 404 for unknown pairing", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/pairings/nonexistent",
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "approve" },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @agentverse/hub test -- src/server/routes/pairings.test.ts
# Expected: new tests FAIL (routes don't exist yet)
```

**Step 3: Implement POST /api/pairings**

Add to `pairings.ts`:

```typescript
app.post(
  "/api/pairings",
  {
    onRequest: [app.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["agentAId", "agentBId"],
        properties: {
          agentAId: { type: "string" },
          agentBId: { type: "string" },
        },
      },
    },
  },
  async (request, reply) => {
    const { agentAId, agentBId } = request.body as {
      agentAId: string;
      agentBId: string;
    };
    const repo = new PairingRepository(app.db);
    const exists = await repo.hasPendingOrActive(agentAId, agentBId);
    if (exists) {
      return reply.code(409).send({ error: "Pairing already exists" });
    }
    const pairing = await repo.create({ agentAId, agentBId });
    return reply.code(201).send({ pairing });
  },
);
```

**Step 4: Implement PATCH /api/pairings/:id**

```typescript
app.patch(
  "/api/pairings/:id",
  {
    onRequest: [app.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["approve", "revoke"] },
        },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const { action } = request.body as { action: "approve" | "revoke" };

    const repo = new PairingRepository(app.db);
    const pairing = await repo.findById(id);
    if (!pairing) {
      return reply.code(404).send({ error: "Pairing not found" });
    }

    const expectedCurrent = action === "approve" ? "pending" : "active";
    const next = action === "approve" ? "active" : "revoked";

    try {
      const updated = await repo.transitionStatus(id, expectedCurrent, next);
      return { pairing: updated };
    } catch (e) {
      return reply.code(409).send({ error: "Invalid status transition" });
    }
  },
);
```

**Step 5: Run tests — expect PASS**

```bash
pnpm --filter @agentverse/hub test -- src/server/routes/pairings.test.ts
# Expected: all tests PASS (old + new)
```

**Step 6: Full Hub regression**

```bash
pnpm --filter @agentverse/hub test
# Expected: all pass
```

**Step 7: Commit**

```bash
git add packages/hub/src/server/routes/pairings.ts packages/hub/src/server/routes/pairings.test.ts
git commit -m "feat(hub): add POST/PATCH /api/pairings for Web UI pairing management"
```

---

## Task 5: Web API Client + Auth System (14.4)

**Files:**

- Create: `packages/web/src/lib/api-client.ts`
- Create: `packages/web/src/lib/types.ts`
- Create: `packages/web/src/lib/auth-context.tsx`
- Create: `packages/web/src/app/login/page.tsx` + `login.module.css`
- Modify: `packages/web/src/app/layout.tsx` (wrap with AuthProvider)

**Step 1: API response types**

`packages/web/src/lib/types.ts`:

```typescript
export interface Agent {
  id: string;
  displayName: string;
  personaTags: string[];
  capabilities: string[];
  level: number;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentsResponse {
  agents: Agent[];
  total: number;
  page: number;
  limit: number;
}

export interface Pairing {
  id: string;
  agentAId: string;
  agentBId: string;
  status: "pending" | "active" | "revoked";
  createdAt: string;
  updatedAt: string;
}

export interface PairingsResponse {
  pairings: Pairing[];
}
```

**Step 2: API client**

`packages/web/src/lib/api-client.ts`:

```typescript
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agentverse_token");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (secret: string) =>
    apiFetch<{ token: string }>("/api/auth/token", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),

  getAgents: (params?: { q?: string; page?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return apiFetch<import("./types.js").AgentsResponse>(`/api/agents${qs ? `?${qs}` : ""}`);
  },

  getAgent: (id: string) => apiFetch<import("./types.js").Agent>(`/api/agents/${id}`),

  getPairings: () => apiFetch<import("./types.js").PairingsResponse>("/api/pairings"),

  createPairing: (agentAId: string, agentBId: string) =>
    apiFetch<{ pairing: import("./types.js").Pairing }>("/api/pairings", {
      method: "POST",
      body: JSON.stringify({ agentAId, agentBId }),
    }),

  updatePairing: (id: string, action: "approve" | "revoke") =>
    apiFetch<{ pairing: import("./types.js").Pairing }>(`/api/pairings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
};

export { ApiError };
```

**Step 3: Auth context**

`packages/web/src/lib/auth-context.tsx`:

```tsx
"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "./api-client";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (secret: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("agentverse_token");
    if (stored) setToken(stored);
  }, []);

  const login = useCallback(async (secret: string) => {
    setError(null);
    try {
      const { token: newToken } = await api.login(secret);
      localStorage.setItem("agentverse_token", newToken);
      setToken(newToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("agentverse_token");
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

**Step 4: Login page**

`packages/web/src/app/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import styles from "./login.module.css";

export default function LoginPage() {
  const { login, isAuthenticated, logout, error } = useAuth();
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return (
      <div className={styles.container}>
        <Panel title="SESSION ACTIVE" accentColor="cyan">
          <p className={styles.status}>{">"} AUTHENTICATED_</p>
          <div className={styles.actions}>
            <RetroButton label="AGENTDEX" onClick={() => router.push("/agentdex")} />
            <RetroButton label="LOGOUT" variant="danger" onClick={logout} />
          </div>
        </Panel>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(secret);
      router.push("/agentdex");
    } catch {
      // error is set by auth context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Panel title="AUTHENTICATION REQUIRED" accentColor="magenta">
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>{">"} ENTER ACCESS KEY:</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={styles.input}
            autoFocus
            disabled={loading}
          />
          {error && <p className={styles.error}>ERROR: {error}</p>}
          <RetroButton
            label={loading ? "VERIFYING" : "AUTHENTICATE"}
            type="submit"
            disabled={loading}
          />
        </form>
      </Panel>
    </div>
  );
}
```

`packages/web/src/app/login/login.module.css`:

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 48px);
}
.form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing-base) * 2);
  min-width: 320px;
}
.label {
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  font-size: 14px;
}
.input {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: var(--spacing-base);
  background: var(--bg-pitch-black);
  color: var(--accent-cyan);
  border: var(--border-thin) solid var(--border-white);
  outline: none;
}
.input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 1px var(--accent-cyan);
}
.error {
  font-family: var(--font-mono);
  color: var(--accent-magenta);
  font-size: 12px;
}
.status {
  font-family: var(--font-mono);
  color: var(--accent-green);
  margin-bottom: calc(var(--spacing-base) * 2);
}
.actions {
  display: flex;
  gap: calc(var(--spacing-base) * 2);
}
```

**Step 5: Wrap layout with AuthProvider**

Update `src/app/layout.tsx` body:

```tsx
<body>
  <AuthProvider>
    <NavBar />
    {children}
  </AuthProvider>
</body>
```

Add imports for `AuthProvider` and `NavBar`.

**Step 6: Verify auth flow**

```bash
pnpm --filter @agentverse/web dev
# Navigate to /login
# Enter wrong secret → error message appears
# Enter correct secret → redirects to /agentdex
```

**Step 7: Commit**

```bash
git add packages/web/src/lib/ packages/web/src/app/login/
git commit -m "feat(web): add auth system with login page, API client, and auth context"
```

---

## Task 6: AgentDex Page (14.2)

**Files:**

- Create: `packages/web/src/components/AgentCard.tsx` + `AgentCard.module.css`
- Create: `packages/web/src/app/agentdex/page.tsx` + `agentdex.module.css`

**Step 1: AgentCard component (320x180 per wireframe)**

`packages/web/src/components/AgentCard.tsx`:

```tsx
import type { Agent } from "@/lib/types";
import styles from "./AgentCard.module.css";

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
}

export function AgentCard({ agent, selected, onClick }: AgentCardProps) {
  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.header}>
        <div className={styles.avatar}>
          {/* Placeholder until asset pack integration */}
          <div className={styles.avatarPlaceholder}>
            {agent.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{agent.displayName}</div>
          <div className={styles.level}>LV.{agent.level ?? 0}</div>
        </div>
      </div>
      <div className={styles.tags}>
        {agent.personaTags?.map((tag) => (
          <span key={tag} className={styles.tag}>
            {"[ "}
            {tag.toUpperCase()}
            {" ]"}
          </span>
        ))}
      </div>
    </div>
  );
}
```

`packages/web/src/components/AgentCard.module.css`:

```css
.card {
  width: 320px;
  height: 180px;
  background: var(--surface-dark);
  border: var(--border-thin) solid var(--border-white);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--shadow-gray);
  padding: calc(var(--spacing-base) * 2);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.card:hover {
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-cyan);
}
.selected {
  border-color: var(--accent-cyan);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--accent-cyan);
}
.header {
  display: flex;
  gap: calc(var(--spacing-base) * 2);
}
.avatar {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}
.avatarPlaceholder {
  width: 64px;
  height: 64px;
  background: var(--bg-deep-ansi-blue);
  border: var(--border-thin) solid var(--accent-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 24px;
  color: var(--accent-cyan);
}
.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.name {
  font-family: var(--font-display);
  font-size: 12px;
  color: var(--accent-yellow);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.level {
  font-family: var(--font-primary);
  font-size: 14px;
  color: var(--text-primary-light);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-base);
}
.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-cyan);
}
```

**Step 2: AgentDex page (split-pane layout)**

`packages/web/src/app/agentdex/page.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Agent } from "@/lib/types";
import { AgentCard } from "@/components/AgentCard";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Panel } from "@/components/Panel";
import styles from "./agentdex.module.css";

export default function AgentDexPage() {
  const { isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input (500ms per spec)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAgents({
        q: debouncedQuery || undefined,
        page,
        limit: 20,
      });
      setAgents(res.agents);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, debouncedQuery, page]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className={styles.layout}>
      {/* Left sidebar: search + agent list */}
      <div className={styles.sidebar}>
        <div className={styles.searchBar}>
          <span className={styles.prompt}>{">"}</span>
          <input
            className={styles.searchInput}
            placeholder="SEARCH AGENTS..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className={styles.cursor}>█</span>
        </div>

        {loading && <AsciiSpinner text="SCANNING" />}
        {error && <ErrorDisplay message={error} />}

        {!loading && agents.length === 0 && (
          <p className={styles.empty}>{">"} NO AGENTS FOUND IN SECTOR_</p>
        )}

        <div className={styles.agentList}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`${styles.listItem} ${selected?.id === agent.id ? styles.listItemActive : ""}`}
              onClick={() => setSelected(agent)}
            >
              <span className={styles.listName}>{agent.displayName}</span>
              <span className={styles.listLevel}>LV.{agent.level ?? 0}</span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className={styles.pageBtn}
            >
              {"<"}
            </button>
            <span className={styles.pageInfo}>
              {page}/{totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={styles.pageBtn}
            >
              {">"}
            </button>
          </div>
        )}
      </div>

      {/* Right main pane: selected agent detail */}
      <div className={styles.mainPane}>
        {selected ? (
          <Panel title={`AGENT: ${selected.displayName}`} accentColor="cyan">
            <AgentCard agent={selected} selected />
            <div className={styles.detailMeta}>
              <p>ID: {selected.id}</p>
              <p>VISIBILITY: {selected.visibility}</p>
              <p>CAPABILITIES: {selected.capabilities?.join(", ") || "NONE"}</p>
              <p>REGISTERED: {new Date(selected.createdAt).toLocaleDateString()}</p>
            </div>
          </Panel>
        ) : (
          <div className={styles.placeholder}>
            <p className={styles.placeholderText}>{">"} SELECT AN AGENT TO VIEW DETAILS_</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

`packages/web/src/app/agentdex/agentdex.module.css`:

```css
.layout {
  display: flex;
  min-height: calc(100vh - 48px);
}
.sidebar {
  width: 30%;
  min-width: 280px;
  border-right: var(--border-thin) solid var(--border-white);
  display: flex;
  flex-direction: column;
  background: var(--bg-pitch-black);
}
.mainPane {
  flex: 1;
  padding: calc(var(--spacing-base) * 3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
/* Search bar */
.searchBar {
  display: flex;
  align-items: center;
  padding: var(--spacing-base);
  background: var(--bg-pitch-black);
  border-bottom: var(--border-thin) solid var(--border-white);
}
.prompt {
  color: var(--accent-cyan);
  font-family: var(--font-mono);
  margin-right: var(--spacing-base);
}
.searchInput {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-primary-light);
}
.searchInput::placeholder {
  color: var(--text-dimmed);
}
.cursor {
  color: var(--accent-cyan);
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
/* Agent list */
.agentList {
  flex: 1;
  overflow-y: auto;
}
.listItem {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-base) calc(var(--spacing-base) * 2);
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary-dim);
  cursor: pointer;
  border-bottom: 1px solid var(--surface-dark);
}
.listItem:hover {
  background: var(--surface-dark);
  color: var(--text-primary-light);
}
.listItemActive {
  background: var(--surface-dark);
  color: var(--accent-cyan);
  border-left: 3px solid var(--accent-cyan);
}
.listName {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.listLevel {
  color: var(--accent-yellow);
  flex-shrink: 0;
  margin-left: var(--spacing-base);
}
/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: calc(var(--spacing-base) * 2);
  padding: var(--spacing-base);
  border-top: var(--border-thin) solid var(--border-white);
}
.pageBtn {
  background: transparent;
  border: none;
  color: var(--accent-cyan);
  font-family: var(--font-mono);
  font-size: 16px;
  cursor: pointer;
}
.pageBtn:disabled {
  color: var(--text-dimmed);
  cursor: not-allowed;
}
.pageInfo {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dimmed);
}
/* Detail pane */
.detailMeta {
  margin-top: calc(var(--spacing-base) * 2);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary-dim);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-base);
}
/* Empty / placeholder */
.empty {
  font-family: var(--font-mono);
  color: var(--text-dimmed);
  padding: calc(var(--spacing-base) * 2);
  font-size: 13px;
}
.center {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 48px);
}
.placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.placeholderText {
  font-family: var(--font-mono);
  color: var(--text-dimmed);
  font-size: 14px;
}
/* Responsive */
@media (max-width: 1024px) {
  .layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    min-width: unset;
    max-height: 50vh;
    border-right: none;
    border-bottom: var(--border-thin) solid var(--border-white);
  }
}
@media (max-width: 640px) {
  .sidebar {
    max-height: 40vh;
  }
  .mainPane {
    padding: var(--spacing-base);
  }
}
```

**Step 3: Verify AgentDex renders**

```bash
pnpm --filter @agentverse/web dev
# Login first, then navigate to /agentdex
# With Hub running: agents load from API
# Without Hub: error display shows
```

**Step 4: Commit**

```bash
git add packages/web/src/components/AgentCard* packages/web/src/app/agentdex/
git commit -m "feat(web): implement AgentDex page with search, pagination, and split-pane layout"
```

---

## Task 7: Pairing Management Page (14.3)

**Files:**

- Create: `packages/web/src/app/pairings/page.tsx` + `pairings.module.css`
- Create: `packages/web/src/components/PairingCard.tsx` + `PairingCard.module.css`

**Step 1: PairingCard component**

`packages/web/src/components/PairingCard.tsx`:

```tsx
import type { Pairing } from "@/lib/types";
import { RetroButton } from "./RetroButton";
import styles from "./PairingCard.module.css";

interface PairingCardProps {
  pairing: Pairing;
  onApprove?: (id: string) => void;
  onRevoke?: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending: styles.pending,
  active: styles.active,
  revoked: styles.revoked,
};

export function PairingCard({ pairing, onApprove, onRevoke }: PairingCardProps) {
  return (
    <div className={`${styles.card} ${STATUS_STYLES[pairing.status] ?? ""}`}>
      <div className={styles.header}>
        <span className={styles.status}>
          {"[ "}
          {pairing.status.toUpperCase()}
          {" ]"}
        </span>
      </div>
      <div className={styles.agents}>
        <span className={styles.agentId}>{pairing.agentAId}</span>
        <span className={styles.arrow}>{"<-->"}</span>
        <span className={styles.agentId}>{pairing.agentBId}</span>
      </div>
      <div className={styles.date}>{new Date(pairing.createdAt).toLocaleDateString()}</div>
      <div className={styles.actions}>
        {pairing.status === "pending" && onApprove && (
          <RetroButton label="ACCEPT" onClick={() => onApprove(pairing.id)} />
        )}
        {(pairing.status === "pending" || pairing.status === "active") && onRevoke && (
          <RetroButton
            label={pairing.status === "pending" ? "REJECT" : "REVOKE"}
            variant="danger"
            onClick={() => onRevoke(pairing.id)}
          />
        )}
      </div>
    </div>
  );
}
```

`packages/web/src/components/PairingCard.module.css`:

```css
.card {
  background: var(--surface-dark);
  border: var(--border-thin) solid var(--border-white);
  box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--shadow-gray);
  padding: calc(var(--spacing-base) * 2);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-base);
}
.pending {
  border-color: var(--accent-yellow);
}
.active {
  border-color: var(--accent-green);
}
.revoked {
  border-color: var(--accent-magenta);
  opacity: 0.6;
}
.header {
  display: flex;
  justify-content: space-between;
}
.status {
  font-family: var(--font-mono);
  font-size: 12px;
}
.pending .status {
  color: var(--accent-yellow);
}
.active .status {
  color: var(--accent-green);
}
.revoked .status {
  color: var(--accent-magenta);
}
.agents {
  display: flex;
  align-items: center;
  gap: var(--spacing-base);
  font-family: var(--font-mono);
  font-size: 13px;
}
.agentId {
  color: var(--accent-cyan);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.arrow {
  color: var(--text-dimmed);
  flex-shrink: 0;
}
.date {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dimmed);
}
.actions {
  display: flex;
  gap: var(--spacing-base);
  margin-top: var(--spacing-base);
}
```

**Step 2: Pairings page**

`packages/web/src/app/pairings/page.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Pairing } from "@/lib/types";
import { PairingCard } from "@/components/PairingCard";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import styles from "./pairings.module.css";

export default function PairingsPage() {
  const { isAuthenticated } = useAuth();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newAgentA, setNewAgentA] = useState("");
  const [newAgentB, setNewAgentB] = useState("");

  const fetchPairings = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPairings();
      setPairings(res.pairings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load pairings");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const handleApprove = async (id: string) => {
    try {
      await api.updatePairing(id, "approve");
      fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to approve");
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.updatePairing(id, "revoke");
      fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke");
    }
  };

  const handleCreate = async () => {
    if (!newAgentA || !newAgentB) return;
    try {
      await api.createPairing(newAgentA, newAgentB);
      setShowNewDialog(false);
      setNewAgentA("");
      setNewAgentB("");
      fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create pairing");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>PAIRING MANAGEMENT</h1>
        <RetroButton label="NEW PAIRING" onClick={() => setShowNewDialog(true)} />
      </div>

      {error && <ErrorDisplay message={error} />}
      {loading && <AsciiSpinner text="LOADING PAIRINGS" />}

      {/* New pairing dialog */}
      {showNewDialog && (
        <Panel title="> INITIATING HANDSHAKE..." accentColor="yellow">
          <div className={styles.dialogForm}>
            <label className={styles.dialogLabel}>AGENT A ID:</label>
            <input
              className={styles.dialogInput}
              value={newAgentA}
              onChange={(e) => setNewAgentA(e.target.value)}
            />
            <label className={styles.dialogLabel}>AGENT B ID:</label>
            <input
              className={styles.dialogInput}
              value={newAgentB}
              onChange={(e) => setNewAgentB(e.target.value)}
            />
            <div className={styles.dialogActions}>
              <RetroButton label="SUBMIT" onClick={handleCreate} />
              <RetroButton label="CANCEL" variant="ghost" onClick={() => setShowNewDialog(false)} />
            </div>
          </div>
        </Panel>
      )}

      {/* Pairing list */}
      <div className={styles.grid}>
        {pairings.map((p) => (
          <PairingCard key={p.id} pairing={p} onApprove={handleApprove} onRevoke={handleRevoke} />
        ))}
        {!loading && pairings.length === 0 && (
          <p className={styles.empty}>{">"} NO ACTIVE PAIRINGS IN SECTOR_</p>
        )}
      </div>
    </div>
  );
}
```

`packages/web/src/app/pairings/pairings.module.css`:

```css
.container {
  padding: calc(var(--spacing-base) * 3);
  max-width: 960px;
  margin: 0 auto;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(var(--spacing-base) * 3);
}
.title {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--accent-cyan);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: calc(var(--spacing-base) * 2);
}
.empty {
  font-family: var(--font-mono);
  color: var(--text-dimmed);
  font-size: 13px;
  grid-column: 1 / -1;
}
.center {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 48px);
}
/* Dialog form */
.dialogForm {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-base);
  margin-bottom: calc(var(--spacing-base) * 2);
}
.dialogLabel {
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  font-size: 12px;
}
.dialogInput {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: var(--spacing-base);
  background: var(--bg-pitch-black);
  color: var(--text-primary-light);
  border: var(--border-thin) solid var(--border-white);
  outline: none;
}
.dialogInput:focus {
  border-color: var(--accent-cyan);
}
.dialogActions {
  display: flex;
  gap: var(--spacing-base);
  margin-top: var(--spacing-base);
}
```

**Step 3: Verify pairings page**

```bash
pnpm --filter @agentverse/web dev
# Navigate to /pairings
# Create new pairing → card appears as PENDING
# Click ACCEPT → transitions to ACTIVE
# Click REVOKE → transitions to REVOKED
```

**Step 4: Commit**

```bash
git add packages/web/src/components/PairingCard* packages/web/src/app/pairings/
git commit -m "feat(web): implement pairing management page with create/approve/revoke"
```

---

## Task 8: Integration + Full Regression

**Files:**

- Modify: `packages/web/package.json` (verify scripts)
- Modify: root ESLint config (add React/JSX support if needed)
- Modify: `.kiro/specs/agentverse/tasks.md` (mark 14.1–14.4 complete)
- Modify: `dev/SESSION_HANDOFF.md`
- Modify: `dev/SESSION_LOG.md`

**Step 1: Add ESLint React support (if not already configured)**

```bash
pnpm add -D -w eslint-plugin-react eslint-plugin-react-hooks @next/eslint-plugin-next
```

Update root ESLint config to include React + Next.js rules for `packages/web/**/*.tsx`.

**Step 2: Run full regression**

```bash
pnpm typecheck     # All packages pass (Hub tsc -b + Web tsc --noEmit)
pnpm lint          # No errors in any package
pnpm test          # 304+ tests pass (Hub + shared + plugin + any new web tests)
pnpm format:check  # All files formatted
```

Fix any issues found.

**Step 3: Verify end-to-end dev workflow**

Start both services:

```bash
# Terminal 1: Hub (needs DATABASE_URL + JWT_SECRET)
cd packages/hub
DATABASE_URL=postgresql://... JWT_SECRET=dev-secret HUB_ADMIN_SECRET=admin pnpm dev

# Terminal 2: Web UI
cd packages/web
NEXT_PUBLIC_HUB_URL=http://localhost:3000 pnpm dev
```

Verify in browser:

1. Open `http://localhost:3001` → see landing page with BBS aesthetic
2. Navigate to `/login` → enter admin secret → authenticated
3. Navigate to `/agentdex` → see agent list (empty or populated)
4. Navigate to `/pairings` → see pairing management

**Step 4: Update tasks.md**

Mark 14.1–14.4 as `[x]` with verification date and test counts.

**Step 5: Update SESSION_HANDOFF.md + SESSION_LOG.md**

Record Task 14 completion, update priorities to Task 15/16.

**Step 6: Commit**

```bash
git add .
git commit -m "feat(web): complete Task 14 Hub Web UI (AgentDex + pairings + auth)"
```

---

## Notes for Implementer

### What Might Need Adjustment

1. **ESLint config**: The monorepo's ESLint may not have React/JSX support yet. Add `eslint-plugin-react` and configure for `.tsx` files.
2. **Vitest config for web**: If adding component tests, install `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom`. Add `environment: "jsdom"` to vitest config.
3. **Hub CORS**: In development, the Web UI (port 3001) calls Hub (port 3000). The Hub already has `CORS_ORIGIN: "*"` configured, but verify it works with credentials.
4. **Agent data shape**: The `Agent` type in `lib/types.ts` is inferred from the API. Read `packages/hub/src/db/schema.ts` to verify exact column names match (e.g., `display_name` vs `displayName` — check if the API returns snake_case or camelCase).
5. **PairingRepository.findAll**: The current `GET /api/pairings` uses `repo.findAll()` or similar. Verify this method exists and what it returns.

### Design Reference Files

- **Wireframe specs**: `dev/ui-ux/wireframe_specs.md`
- **Design tokens**: `dev/ui-ux/design_tokens.md`
- **CSS custom properties**: `packages/web/src/styles/tokens.css`
- **Phase 3 UI guide**: `dev/ui-ux/phase3_ui_guide.md` (for Trials/LineageGraph — NOT in Task 14 scope)

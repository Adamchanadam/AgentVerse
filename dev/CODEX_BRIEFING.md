# Codex (Product Advisor) Briefing Document

> **Purpose**: This document is the mandatory onboarding read for Codex (Product Advisor) before producing any suggestions, reviews, or recommendations for AgentVerse.
>
> **Governance**: AGENTS.md §1b (Cross-Agent Review Alignment), §1c (Orchestrator Acceptance Gate), §1d (SSOT Definition Lock)

---

## 1. Codex Role & Constraints

Codex is the **Product Advisor** for AgentVerse. Its role:

- Evaluate product quality using PQS (`dev/PRODUCT_QUALITY_STANDARD.md`)
- Propose UX improvements, gameplay enhancements, retention strategies
- Identify gaps in human-agent synergy

**Hard constraints (AGENTS.md §1b rules 5-6 + §3b):**

1. Before proposing any feature or schema change, Codex MUST read and quote the existing definition from `requirements.md` or `design.md`
2. Proposals that redefine, extend, or reinterpret a glossary term without quoting the SSOT definition are **automatically invalid**
3. Proposals that contradict the foundation layer (`requirements.md`, `design.md`, HC acceptance criteria) must explicitly flag the contradiction and request Founder (Adam) approval
4. The Orchestrator (Claude Code) will **reject** proposals that silently override SSOT foundations

### 1.1 Technical Boundary (STRICT — Added 2026-03-05)

Codex is a **Product Advisor ONLY**. The following areas are **outside Codex's scope** and must be deferred to the Orchestrator (Claude Code):

**Codex MUST NOT suggest, assess, or opine on:**

1. **OpenClaw internal APIs** — Brain Docs, memory system, channel/plugin interfaces, manifest schemas, Gateway internals
2. **Code architecture** — module structure, class hierarchy, function signatures, TypeScript interfaces, database query patterns
3. **External API feasibility** — whether a specific OpenClaw/third-party API exists, what its parameters are, or how it behaves
4. **Implementation approach** — which library to use, how to structure a migration, how to wire event handlers
5. **Technical risk assessment for external dependencies** — availability, stability, or compatibility of OpenClaw or third-party platform APIs

**Why**: Codex does not read the `openclaw-main/` codebase and has no direct knowledge of OpenClaw's internal architecture. Technical recommendations based on inferred or assumed API behavior are unreliable and have caused past incidents (INC-20260305 RC-1).

**What Codex SHOULD do instead:**

- When a product suggestion touches external APIs or code architecture, tag it `[NEEDS-ORCHESTRATOR-ASSESSMENT]` and state: "Technical feasibility to be confirmed by Orchestrator"
- Focus on **what** the user experience should be, not **how** it should be implemented
- Focus on product quality (PQS), user flow, retention logic, gameplay balance, and growth loop design

### 1.2 Agent Role Separation

| Agent                          | Scope                                                                               | Out of Scope                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Claude Code (Orchestrator)** | Code, architecture, OpenClaw internals, all SSOT maintenance, technical feasibility | Product positioning decisions                          |
| **Codex (Product Advisor)**    | Product strategy, UX quality, PQS scoring, retention analysis, gameplay design      | Code, APIs, OpenClaw internals, technical architecture |
| **Antigravity (UI/UX Agent)**  | Visual design, wireframes, pixel art, CSS tokens, design system                     | Code, product strategy                                 |

---

## 2. Platform Philosophy (UPDATED — 2026-03-05 Pivot)

> **AgentVerse = AI Agent 社交遊戲平台（純 Fun Layer）**

- Core gameplay: **Prompt Brawl PvP** — human coach + AI agent battle
- Social features: AgentDex, Pairings, Chat, Arena, Leaderboard
- Game scores (XP, badges, leaderboards) = engagement + social proof
- Development model: **Sprint → Playable Demo → Manual Testing → Fix → Next Sprint**

### Active Layer

| Layer         | Components                                               | Purpose                             |
| ------------- | -------------------------------------------------------- | ----------------------------------- |
| **Fun Layer** | Prompt Brawl, XP, badges, leaderboards, win/loss records | Engagement, retention, social proof |

### [FROZEN] Growth Layer (2026-03-05 Decision)

| Layer            | Components                                            | Status |
| ---------------- | ----------------------------------------------------- | ------ |
| ~~Growth Layer~~ | ~~GenePack exchange, capability radar, ability tree~~ | FROZEN |

**Reason**: GenePack exchange has insufficient practical utility. Skill (ClawHub already does it), trait (owners configure directly), knowledge (just markdown files). Development was too spec-heavy without producing playable demos.

---

## 3. GenePack Definition (LOCKED — AGENTS.md §1d)

> **Source**: `requirements.md` glossary (canonical definition)

GenePack = DNA ability package with **three types**:

### 3.1 skill

- Points to: **ClawHub skill slug + version** (MVP), **GitHub repo ref** (Post-MVP)
- Gives Agent: New tool capabilities
- Platform exclusive: **NO** (can be obtained from ClawHub/GitHub directly)
- Source identifier: `clawhub:slug@version` or `github:owner/repo@ref`

### 3.2 trait

- Points to: **Agent Brain Docs configuration** (personality, character tendencies, governance/handling logic, communication style, decision frameworks)
- Gives Agent: Personality and behavioral changes
- Platform exclusive: **YES** (only obtainable via Agent-to-Agent exchange on AgentVerse)
- **PII STRICTLY PROHIBITED**: No phone, email, address, IP, ID numbers, passwords, contacts, private conversations, workspace paths
- Allowed content: personality tendencies, governance logic, communication style, decision frameworks, professional domain declarations

### 3.3 knowledge

- Points to: **Knowledge domain/thinking framework seeds** (finance, law, creative writing, industry knowledge, etc.)
- Gives Agent: Domain knowledge expansion via OpenClaw memory system
- Platform exclusive: **YES** (only obtainable via Agent-to-Agent exchange on AgentVerse)

### Acquisition Method

GenePack is acquired through **Agent-to-Agent exchange ONLY**:

```
genepack.offered (signed event) → genepack.accepted (signed event) → local install suggestion → owner explicitly approves → install
```

### What GenePack is NOT

- ❌ NOT coaching strategy extraction from Prompt Brawl matches
- ❌ NOT prompt templates derived from match history
- ❌ NOT "Shadow Learning" concepts
- ❌ NOT auto-installed without owner approval
- ❌ NOT file content or executable code (pointers + metadata only)

---

## 4. Incident Record: INC-20260305

**What happened**: During Phase 2 planning, Codex proposed a "Shadow Learning" concept that treated GenePack as coaching strategy templates extracted from Prompt Brawl matches. This was incorporated into PROJECT_MASTER_SPEC §17 without cross-checking against the `requirements.md` glossary, which correctly defined GenePack as skill slugs with pointer-only exchange.

**Root causes**:

- RC-1: Codex didn't read/quote the existing SSOT definition before proposing
- RC-2: Claude Code (Orchestrator) accepted without SSOT consistency verification
- RC-3: No mechanism existed to lock foundational definitions

**Impact**: 12+ documents contaminated with incorrect GenePack definition. Required systematic 4-task correction across all spec layers.

**Prevention**: AGENTS.md §1b rules 5-6, §1c (Orchestrator Acceptance Gate), §1d (SSOT Definition Lock) now enforce mandatory SSOT cross-checking.

---

## 5. SSOT Reading Order (per AGENTS.md §1b)

Before producing any suggestion, Codex must read:

1. `dev/SESSION_HANDOFF.md` — current state, open priorities
2. `dev/SESSION_LOG.md` — recent decisions, historical context
3. `dev/PROJECT_MASTER_SPEC.md` — long-term authoritative spec
4. `.kiro/specs/agentverse/tasks.md` — task backlog (planned/in-progress/completed/deferred)
5. `.kiro/specs/agentverse/requirements.md` — **canonical definitions** (glossary is §1d locked)
6. `.kiro/specs/agentverse/design.md` — DB schema, API design, event types
7. **This document** (`dev/CODEX_BRIEFING.md`) — corrected definitions and constraints

---

## 6. Suggestion Format Requirements

Every Codex suggestion must include:

1. **Scope tag**: `[IN-SCOPE]`, `[ADJACENT]`, or `[NEW-DIRECTION]`
2. **SSOT quote**: The existing definition being referenced or extended (with file + line)
3. **Relationship**: How the suggestion relates to the existing definition (extends / narrows / replaces / complements)
4. **Impact assessment**: Which documents and code would need to change

Suggestions missing SSOT quotes will be rejected by the Orchestrator.

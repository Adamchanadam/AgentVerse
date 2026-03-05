# Antigravity Task Brief: Arena Page Wireframe + Coach Console UX

> **From**: Claude Code (Orchestrator) + Codex (Product Advisor)
> **To**: Antigravity (UI/UX Designer)
> **Date**: 2026-03-05
> **Priority**: HIGH — Arena is Phase 2 centerpiece, currently has no formal design spec

---

## Context (Self-Contained)

The Arena page (`packages/web/src/app/arena/page.tsx`) is the Prompt Brawl game screen.
It was implemented using the concept images in `dev/ui-ux/Prompt_Brawl_Concept_Ref/` as
loose guidance, but **no formal wireframe exists** comparable to `wireframe_specs.md` sections
for AgentCard/AgentDex/Pairings/Chat.

### What Prompt Brawl Is

A 1v1 conversation game where two human users each "coach" their AI agent. The agents
exchange messages. A hidden forbidden word/pattern rule is in play. If an agent says the
forbidden word, that agent's side **loses**. The human's role is writing a "coaching strategy"
that the LLM uses to generate the agent's messages — the human does NOT type the messages
directly.

### Current Arena Layout (Implemented)

```
+------------------------------------------------------+
| STATUS: Round 3 | timer 25s | Rule: h____ | [SECURE] |
+----------+-----------------------------------+-------+
|  COACH   |                                   |DANGER |
| CONSOLE  |   >>> MATCH STARTED <<<           |       |
|          |   > you: I think we should...     | [████ |
| [textarea]|  > Agent-B: That's interesting.. |  ░░░] |
|          |   > you: Let me explain why...    |  40%  |
| [SEND    |                                   |       |
| STRATEGY]|                                   |       |
+----------+-----------------------------------+-------+
```

3-column grid: Coach Console (280px) | Chat Panel (flex) | Danger Meter (120px)

### Current Implementation Files

- `packages/web/src/app/arena/page.tsx` — React page component
- `packages/web/src/app/arena/arena.module.css` — styling
- `packages/web/src/components/DangerMeter.tsx` — danger level visual
- `packages/web/src/components/DangerMeter.module.css`

### Design References Already Available

- `dev/ui-ux/Prompt_Brawl_Concept_Ref/` — 5 concept images (brawl_ui_1-5.png)
- `dev/ui-ux/design_tokens.md` — full color/font/spacing spec
- `dev/ui-ux/wireframe_specs.md` — format reference for other pages
- `packages/web/src/styles/tokens.css` — CSS custom properties

---

## Deliverable 1: Arena Wireframe

Add **Section 7: Arena (Prompt Brawl)** to `dev/ui-ux/wireframe_specs.md`.

Must specify:

### 7.1 Layout

- 3-column grid dimensions and responsive behavior
- Status bar content and positioning
- How layout adapts at sm (640px), md (1024px) breakpoints

### 7.2 Coach Console Panel (Left)

- Textarea dimensions and placeholder text
- SEND STRATEGY button placement
- "Thinking..." loading state while LLM generates response
- **Critical: How to visually distinguish the human's coaching input from the agent's generated
  response** — the user must see the connection between what they coached and what the agent said.
  Current implementation shows only the agent's output.

### 7.3 Chat Panel (Center)

- Message bubble styling (self = cyan, peer = yellow, system = dimmed per existing tokens)
- Match start banner
- Rule trigger highlight moment
- Scrolling behavior

### 7.4 Danger Meter Panel (Right)

- ASCII bar visualization spec
- Color thresholds (low=green, medium=yellow, high=magenta/red)
- Size and positioning

### 7.5 Result Overlay

- VICTORY / DEFEAT display
- XP gain display
- Badge unlock notification (if applicable)
- REMATCH and BACK buttons
- This should be a "screenshot moment" — visually interesting enough to share

### 7.6 Pre-Match States

- Idle state (waiting, no match yet)
- Pre-match briefing (explain rules to new user in 3-4 BBS-styled lines)
- Challenge sent (waiting for opponent)

### 7.7 Mobile Adaptation

- How 3-column layout collapses on mobile
- Which panel gets priority on small screens

### 7.8 GenePack Exchange Preview Panel (Future-Ready)

**Context:** In Phase 3, paired Agents can exchange GenePacks (DNA ability packages) with each
other. GenePacks come in three types: **skill** (ClawHub/GitHub tools), **trait** (Agent personality
config from Brain Docs), and **knowledge** (domain knowledge seeds). This is NOT coaching strategy
extraction — it's Agent-to-Agent capability exchange. This section only needs a **placeholder
layout**, not full implementation.

Design a GenePack preview in the AgentDex detail panel or Coach Console that shows:

- Agent's equipped GenePack backpack preview (Mabinogi-style inventory with self-use/public areas)
- `[BROWSE GENEPACK]` button (styled as RetroButton, disabled/grayed for now)
- `[PROPOSE EXCHANGE]` button (styled as RetroButton, disabled/grayed for now)
- Brief text: "Coming soon: exchange skills, traits, and knowledge with paired Agents"

Visual reference: Think of Mabinogi pet backpack UI — self-use area (private) + public browsing area for exchange.

### 7.9 Spectator / Replay Layout (Future-Ready)

**Context:** Watching AI compete is inherently engaging content (validated by AI Arena market
research). Design a read-only variant of the Arena layout for spectators.

Differences from player view:

- No Coach Console (left panel hidden or replaced with match info)
- Chat panel expands to full width
- Status bar shows both agent names + timer + round
- Danger Meters for BOTH sides visible (since spectator is neutral)
- No SEND STRATEGY button
- Layout: `Match Info (200px) | Chat (flex) | Dual Danger Meters (200px)`

This is a wireframe-only deliverable — no code changes. Mark as `[FUTURE]` in the spec.

---

## Deliverable 2: Coach Console UX Specification

A new document `dev/ui-ux/coach_console_ux.md` specifying:

### The Human-Agent Coaching Flow

This is the **core human-agent synergy interaction**. The current flow is:

1. Human types coaching instruction in textarea
2. Click SEND STRATEGY
3. LLM generates agent's response (invisible to user)
4. Response appears in chat as "you:" message

**Problem**: The human never sees the connection between their coaching input and the
agent's generated response. The agent has no visible personality.

### Design Requirements

1. **3-step visibility**: Show (a) coach input, (b) "AGENT PROCESSING..." state,
   (c) agent's generated response — before it sends to opponent
2. **Agent identity**: Agent's messages should have a distinct label
   (e.g., `> [YourAgent]: response`) rather than generic "you:"
3. **Strategy history**: Show the last 2-3 coaching inputs in the coach panel
   so the human can see their coaching evolution
4. **Feedback signal**: After match, show which coaching instructions led to
   which outcomes (optional, can be minimal for MVP)

### Visual Spec

Follow `design_tokens.md` rules:

- Coach input: white text on surface-dark
- Agent processing: ASCII spinner + "COMPUTING RESPONSE..."
- Agent response preview: cyan border highlight before send
- All within the 280px left panel

---

## Deliverable 3: Settings Page Wireframe

Add **Section 8: Settings** to `dev/ui-ux/wireframe_specs.md`.

For the LLM API key configuration page:

- API key input field (masked, show/hide toggle)
- "Your API key never leaves your browser" security notice (prominent)
- Connection test button with pass/fail indicator
- Provider selection (MiniMax M2.5 default, extensible for future providers)
- BBS-styled panel layout consistent with other pages

---

## Constraints & Boundaries

- **Follow existing design tokens** — `dev/ui-ux/design_tokens.md` is the aesthetic SSOT
- **Follow wireframe_specs.md format** — match the style and detail level of Sections 1-6
- **border-radius: 0, hard shadows only** — no exceptions (CSS iron rules)
- **Do NOT modify any code files** — this deliverable is design spec only
- **Reference concept images** where applicable (cite by filename)
- **All measurements in px** — use 8px grid system per design tokens

---

## Acceptance Criteria

- [ ] Section 7 added to wireframe_specs.md with all 9 subsections (7.1–7.9)
- [ ] New file coach_console_ux.md created in dev/ui-ux/
- [ ] Section 8 added to wireframe_specs.md for Settings page
- [ ] All specs follow design_tokens.md rules
- [ ] All specs include responsive breakpoints (sm/md/lg)
- [ ] Concept images referenced where relevant
- [ ] Section 7.8 (GenePack Exchange Preview) marked as [FUTURE] placeholder
- [ ] Section 7.9 (Spectator/Replay) marked as [FUTURE] with dual-danger-meter layout

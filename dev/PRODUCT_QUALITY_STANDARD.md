# AgentVerse Product Quality Standard (PQS) v1.0

> **Governance SSOT**: This document is the authoritative product quality evaluation standard for AgentVerse.
> All development agents (Claude Code, Codex, Antigravity, etc.) must reference this standard when
> building, reviewing, or optimizing product features.
>
> **Owner**: Codex (Product Advisor) maintains; Claude Code (Orchestrator) enforces.
> **Review cadence**: Re-evaluate scores at every Phase checkpoint (§3c Release/Merge Gate).

---

## 0) Purpose & Scope

This standard defines **what good looks like** for AgentVerse as a product — not just as code.
It complements AGENTS.md (development governance) by adding a **Product Layer** evaluation framework.

### Layer Relationship (per AGENTS.md §0a)

| Layer                  | Governed By                     | Standard                                  |
| ---------------------- | ------------------------------- | ----------------------------------------- |
| Development Governance | AGENTS.md                       | Process, safety, handoff discipline       |
| Product Quality        | **This document (PQS)**         | UX, gameplay, retention, visual coherence |
| Technical Spec         | PROJECT_MASTER_SPEC.md          | Architecture, protocols, schema           |
| Task Execution         | .kiro/specs/agentverse/tasks.md | Backlog, acceptance criteria              |

### Core Product Principle

AgentVerse serves **both human users and OpenClaw AI Agents**. Every feature must enable
**collaborative, synergistic human + agent experiences** where:

- The human actively participates, strategizes, and coaches
- The agent executes, learns, and develops visible personality
- Success requires both human insight AND agent capability
- The experience is visual, engaging, and worth sharing

---

## 1) Evaluation Dimensions

### Dimension 1: Human-Agent Synergy (Weight: CRITICAL)

**Definition:** How well features enable collaborative human + agent experiences where the human
actively participates and the agent is a visible, distinct partner.

**Criteria:**

- Human has a clear, meaningful role distinct from the agent's role
- Human can observe, influence, and learn from agent behavior
- Success requires both human strategic thinking AND agent execution
- Agent feels like a distinct entity with its own personality
- Human feels ownership and emotional connection to agent growth
- Agent capability growth (skill/trait/knowledge) creates real daily-work value, not just game scores

**Red Flags:**

- Features that work the same whether a human is involved or not
- Agent behavior is opaque (human cannot understand agent decisions)
- No feedback loop showing how coaching affected outcomes
- Agent has no personality differentiation
- Growth system produces only game-layer progression (XP/badges) without real capability improvement

**Checklist:**

- [ ] Can a user explain in one sentence what their role is in this feature?
- [ ] Does the human's input visibly change the agent's behavior?
- [ ] Is there a feedback signal showing the quality of human-agent collaboration?
- [ ] Does the feature incentivize the human to understand their agent better?
- [ ] Would removing the human make the feature meaningfully worse?
- [ ] Does the agent exhibit traits that make the user feel it is "their" agent?

---

### Dimension 2: Visual Appeal & Aesthetic Consistency (Weight: HIGH)

**Definition:** Whether the interface is visually attractive, maintains the BBS x GBA design language,
and creates a cohesive aesthetic experience.

**Criteria:**

- All elements follow the 5 CSS iron rules (no border-radius, hard shadows, ANSI palette,
  correct fonts, correct backgrounds) per `dev/ui-ux/design_tokens.md`
- Pixel art assets used where specified (avatars, badges, frames, backgrounds)
- Color follows token hierarchy (cyan=focus, magenta=danger, yellow=progress, green=success)
- Typography uses 3-tier font system (Space Grotesk / Press Start 2P / Fira Code)
- Interface looks intentionally retro, not accidentally broken

**Red Flags:**

- Border-radius on any element
- Blurred or soft shadows
- Colors outside ANSI palette without justification
- Generic modern UI elements (rounded buttons, gradient fills, system fonts)
- Placeholder graphics where pixel art should be

**Checklist:**

- [ ] Every component uses tokens.css variables (no hardcoded colors)?
- [ ] border-radius: 0 enforced on all elements?
- [ ] Pixel art assets rendered at native size or integer multiples?
- [ ] Page looks correct on Deep ANSI Blue (#0000AA) background?
- [ ] Shadows are hard-edged with 0px blur?
- [ ] Would a screenshot pass as a believable BBS/GBA screen?

---

### Dimension 3: UX Flow & Onboarding (Weight: HIGH)

**Definition:** How easily new users understand the platform, complete key actions, and progress
from first visit to active engagement.

**Criteria:**

- First-time user reaches meaningful interaction within 60 seconds
- Each page communicates its purpose without external explanation
- Navigation path from AgentDex -> Pairing -> Arena is obvious
- Error states are informative and suggest next actions (in BBS style)
- User can recover from any error state without refreshing

**Red Flags:**

- Dead-end pages with no call to action
- Features requiring prior knowledge to use
- Navigation requiring backtracking
- Error messages without next-step guidance
- Loading > 3 seconds without progress indicator

**Checklist:**

- [ ] Can a new user understand what to do next without instructions?
- [ ] Does each page have a primary CTA that is immediately visible?
- [ ] Is the progression path (Create -> Browse -> Pair -> Challenge -> Fight) discoverable?
- [ ] All loading states use ASCII spinners (not blank screens)?
- [ ] All error states use `FATAL ERROR: 0x000F` format with actionable text?
- [ ] Can the user understand Prompt Brawl before entering the Arena?

---

### Dimension 4: Gameplay Loop & Fun Factor (Weight: HIGH)

**Definition:** Whether the core game mechanic (Prompt Brawl and future modes) is engaging,
understandable, replayable, and produces moments of excitement.

**Criteria:**

- Rules understandable within 30 seconds of a match starting
- Tension builds naturally (DangerMeter, turn timer, approaching forbidden word)
- Victory/defeat feels earned and fair
- Each match produces a different experience
- Players want to play again immediately after a match ends

**Red Flags:**

- Matches ending without user understanding why
- No visible tension or stakes during gameplay
- Same strategies work every time
- Coaching feels disconnected from outcomes
- Victory/defeat is anticlimactic

**Checklist:**

- [ ] Is the rule clearly communicated at match start?
- [ ] Does the DangerMeter create visible tension?
- [ ] Is the turn timer prominent and creating time pressure?
- [ ] Does the Coach Console explain what input is expected?
- [ ] Is the victory/defeat moment visually impactful?
- [ ] Does REMATCH reduce friction to re-engagement?

---

### Dimension 5: Retention & Progression (Weight: MEDIUM)

**Definition:** Whether users have reasons to return, accumulate meaningful progress, and feel
their investment compounding over time.

**Criteria:**

- XP and badges reflect real accomplishment (Fun Layer)
- Win/loss records create competitive identity (Fun Layer)
- Agent growth (stats, badges) is visible to other users
- Always new challenges or goals to pursue
- Progress feels permanent and meaningful
- GenePack exchange provides real capability growth (Growth Layer — skill/trait/knowledge)
- Fun Layer (XP, badges, leaderboards) and Growth Layer (GenePack exchange, capability radar) are independent but coexisting

**Red Flags:**

- XP accumulating with no visible effect
- Badges trivially earned (no accomplishment feeling)
- No reason to return after first session
- Stats only visible to owner (no social proof)
- Progression ceiling reached too quickly
- Growth system only produces game scores without real Agent capability improvement

**Checklist:**

- [ ] Does XP gain trigger a visible notification?
- [ ] Are badges displayed on AgentCard visible to other users?
- [ ] Is there a "next goal" visible after every match?
- [ ] Do stats create meaningful differentiation between agents?
- [ ] Is there content that requires multiple sessions to unlock?
- [ ] (Phase 3) Does GenePack exchange produce observable Agent capability changes?

---

### Dimension 6: Virality & Shareability (Weight: MEDIUM)

**Definition:** Whether the product naturally encourages users to bring others in and whether
the experience is interesting to observe or discuss.

**Criteria:**

- Match results are inherently shareable (interesting narratives)
- Visual aesthetic is distinctive enough to be recognizable in screenshots
- Watching a match is entertaining even without playing
- Natural social loop (need paired opponents to play)
- Agent identities are memorable and personality-driven

**Red Flags:**

- No way to share outcomes externally
- Experience is entirely private with no social surface
- Aesthetic looks generic when screenshotted
- No reason for a player to invite friends

**Checklist:**

- [ ] Can a match result be shared as a screenshot that looks interesting?
- [ ] Is the BBS aesthetic instantly recognizable?
- [ ] Does the pairing requirement naturally create social invitations?
- [ ] Are agent names and personas memorable?
- [ ] Is there a spectator mode or match history others can view?

---

### Dimension 7: Technical Robustness (Weight: HIGH)

**Definition:** Whether the system is reliable, secure, and performs well under normal usage.

**Criteria:**

- All 4 regression gates pass (typecheck, lint, test, format:check)
- E2E encryption correct across all messaging paths
- WebSocket reconnection seamless
- Error states handled gracefully without data loss
- Security boundaries maintained (private keys in browser, Hub never sees plaintext)

**Red Flags:**

- Flaky tests
- Unhandled edge cases in settlement protocol
- Race conditions in match state sync
- API keys exposed in network requests
- Missing error handling on WS disconnect during matches

**Checklist:**

- [ ] All 4 regression gates pass?
- [ ] Test count at or above baseline?
- [ ] All risks in RISK_REGISTER mitigated to acceptable levels?
- [ ] Settlement protocol handles all failure modes?
- [ ] WS reconnection tested under match-in-progress conditions?

---

### Dimension 8: Accessibility & Inclusivity (Weight: MEDIUM)

**Definition:** Whether the product is usable by people with diverse abilities, devices, and contexts.

**Criteria:**

- All interactive elements keyboard-navigable
- ARIA labels provide meaningful descriptions
- Color is not sole means of conveying information
- Interface works at 200% zoom
- Screen readers can navigate core flow

**Red Flags:**

- Interactive elements only responding to mouse
- Color-only status indicators
- Text below 12px
- Missing focus indicators
- Images without alt text

**Checklist:**

- [ ] Core flow completable with keyboard only?
- [ ] All status indicators include text labels alongside color?
- [ ] All images have meaningful alt text?
- [ ] Press Start 2P (min 10px) readable at standard distance?
- [ ] Focus states visible against dark background?

---

## 2) Scoring Guide

Score each dimension 1–5 at every Phase checkpoint:

| Score | Meaning                                                               |
| ----- | --------------------------------------------------------------------- |
| 5     | Excellent — all checklist items pass, would impress in product review |
| 4     | Good — most items pass, minor gaps not impeding experience            |
| 3     | Acceptable — core items pass, several secondary items fail            |
| 2     | Needs Work — several core items fail, noticeable quality gaps         |
| 1     | Critical — fundamental failures breaking the experience               |

### Minimum Thresholds

- **No dimension may be at 1/5 at release** — any score of 1 is a release blocker
- **Weighted average must be >= 4.0** for Phase completion
- **Human-Agent Synergy and Technical Robustness** must each be >= 4
- **All CRITICAL-weight dimensions** must be >= 4 before GA

---

## 3) Application Rules

### 3a) When to Evaluate

- At every Phase checkpoint (tasks.md Phase milestones)
- Before any PR targeting main branch
- When Codex performs a product review
- When any new page or major feature is added

### 3b) Who Evaluates

| Agent                            | Responsibility                                                            |
| -------------------------------- | ------------------------------------------------------------------------- |
| **Codex** (Product Advisor)      | Primary evaluator; maintains this standard; proposes score changes        |
| **Claude Code** (Orchestrator)   | Enforces minimum thresholds; integrates PQS into task acceptance criteria |
| **Antigravity** (UI/UX Designer) | Evaluates Dimensions 2, 3, 8; proposes visual improvements                |
| **Adam** (Founder)               | Final authority on score disputes and threshold exceptions                |

**Codex Constraint (per AGENTS.md §1b/§1c/§1d):** Codex proposals that redefine glossary terms, introduce new schemas, or propose flows that diverge from `requirements.md` / `design.md` foundation definitions must quote the existing SSOT definition and flag the divergence. The Orchestrator must reject proposals that silently contradict SSOT foundations.

### 3c) Integration with Development Workflow

1. **Task planning** (AGENTS.md §3 PLAN): Identify which PQS dimensions are affected
2. **Task review** (AGENTS.md §3 QC): Score affected dimensions before/after
3. **Phase checkpoint** (AGENTS.md §3c Release Gate): Full 8-dimension evaluation required
4. **Session closeout** (AGENTS.md §4): Note any PQS regressions in SESSION_LOG

### 3d) Score History

Record PQS scores in SESSION_LOG at each checkpoint with format:

```
### PQS Evaluation — [Phase X.Y Checkpoint]
| Dimension | Score | Delta | Notes |
|-----------|-------|-------|-------|
| Human-Agent Synergy | X/5 | +N | ... |
| ... | ... | ... | ... |
| **Weighted Average** | **X.X/5** | | |
```

---

## 4) Revision History

| Version | Date       | Author              | Changes                                      |
| ------- | ---------- | ------------------- | -------------------------------------------- |
| 1.0     | 2026-03-05 | Codex + Claude Code | Initial standard from Phase 2 product review |

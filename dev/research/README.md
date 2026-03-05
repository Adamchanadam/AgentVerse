# dev/research/ — Reference Knowledge Base

> **Purpose**: Dynamic reference material for product decisions.
> This directory holds market research, competitor analysis, trend reports, and BBS heritage studies.
>
> **NOT a SSOT.** Only finalized decisions flow into `.kiro/specs/agentverse/` (requirements.md,
> design.md, tasks.md). Content here is advisory, not authoritative.

## Directory Rules

1. **Content is advisory** — research informs decisions but does not dictate them
2. **Date-stamped** — filenames include YYYY-MM for freshness tracking
3. **Codex maintains** — Product Advisor updates research as new information becomes available
4. **Claude Code orchestrates** — decides when research findings become tasks/requirements
5. **Adam approves** — all transitions from research → .kiro/specs require founder sign-off

## File Naming Convention

```
<topic>-<YYYY-MM>.md
```

Examples:

- `market-analysis-2026-03.md`
- `bbs-heritage-fusion-2026-03.md`
- `competitor-landscape-2026-06.md`

## Relationship to Other Documents

```
dev/research/          ← Advisory (dynamic, reference only)
    ↓ (Adam approves)
.kiro/specs/agentverse/
  requirements.md      ← Finalized requirements
  design.md            ← Finalized design decisions
  tasks.md             ← Actionable task backlog
```

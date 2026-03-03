# AgentVerse Plugin -- OpenClaw Integration Smoke Test

Manual verification steps for real OpenClaw Gateway integration (Task 18).

## Prerequisites

- OpenClaw CLI installed (`openclaw --version`)
- Hub running (`docker compose up hub postgres`)
- AgentVerse plugin built (`pnpm --filter @agentverse/plugin build`)

## Steps

1. `openclaw plugins install ./packages/plugin`
2. `openclaw plugins doctor` -- agentverse manifest PASS
3. `openclaw plugins list` -- agentverse appears
4. `openclaw agentverse:status` -- outputs connection status
5. Start Gateway -- agentverse channel available
6. Verify Social Agent config check output in logs
7. `openclaw agentverse:register` -- sends agent.registered event to Hub

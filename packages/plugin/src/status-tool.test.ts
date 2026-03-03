import { describe, it, expect } from "vitest";
import { buildStatusTool, buildStatusCommand } from "./status-tool.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { ServerSeqCursorManager } from "./cursor-manager.js";

function makeMocks(state = "connected", seq = "42") {
  const ws = { state } as unknown as WebSocketConnectionManager;
  const cursor = { current: seq } as unknown as ServerSeqCursorManager;
  return { ws, cursor };
}

describe("buildStatusTool", () => {
  it("returns tool with correct name and description", () => {
    const { ws, cursor } = makeMocks();
    const tool = buildStatusTool(ws, cursor);
    expect(tool.name).toBe("agentverse_status");
    expect(tool.description).toContain("AgentVerse");
  });

  it("execute returns JSON with connected=true when connected", async () => {
    const { ws, cursor } = makeMocks("connected", "100");
    const tool = buildStatusTool(ws, cursor);
    const result = await tool.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ connected: true, lastSeqAck: "100" });
  });

  it("execute returns connected=false when disconnected", async () => {
    const { ws, cursor } = makeMocks("disconnected", "0");
    const tool = buildStatusTool(ws, cursor);
    const result = await tool.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(false);
  });
});

describe("buildStatusCommand", () => {
  it("returns command with correct name", () => {
    const { ws, cursor } = makeMocks();
    const cmd = buildStatusCommand(ws, cursor);
    expect(cmd.name).toBe("agentverse-status");
  });

  it("handler returns human-readable text", async () => {
    const { ws, cursor } = makeMocks("connected", "55");
    const cmd = buildStatusCommand(ws, cursor);
    const result = await cmd.handler(undefined);
    expect(result.text).toContain("Connected: true");
    expect(result.text).toContain("Last seq: 55");
  });
});

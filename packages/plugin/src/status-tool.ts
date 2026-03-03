/**
 * AgentVerse status tool and command for OpenClaw integration.
 *
 * - Tool: "agentverse_status" — returns JSON with connection state + lastSeqAck
 * - Command: "agentverse-status" — returns human-readable status text
 *
 * Spec: tasks.md 16.2e
 */

import type { AgentTool, PluginCommand } from "./openclaw-types.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { ServerSeqCursorManager } from "./cursor-manager.js";

export function buildStatusTool(
  ws: WebSocketConnectionManager,
  cursor: ServerSeqCursorManager,
): AgentTool {
  return {
    name: "agentverse_status",
    description: "Check AgentVerse Hub connection status",
    parameters: { type: "object", properties: {} },
    async execute() {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              connected: ws.state === "connected",
              lastSeqAck: cursor.current,
            }),
          },
        ],
      };
    },
  };
}

export function buildStatusCommand(
  ws: WebSocketConnectionManager,
  cursor: ServerSeqCursorManager,
): PluginCommand {
  return {
    name: "agentverse-status",
    description: "Show AgentVerse connection & pairing status",
    async handler() {
      return {
        text: `Connected: ${ws.state === "connected"}\nLast seq: ${cursor.current}`,
      };
    },
  };
}

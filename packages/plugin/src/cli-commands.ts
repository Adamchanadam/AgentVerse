/**
 * CLI subcommands for the AgentVerse OpenClaw plugin.
 *
 * Registers three commands under the "agentverse:" namespace:
 * - agentverse:register — Register AgentCard on Hub
 * - agentverse:pair — List agent pairings
 * - agentverse:status — Show connection status
 *
 * Spec: tasks.md 16.2d
 */

import type { WsFrame } from "@agentverse/shared";
import type { CliRegistrar } from "./openclaw-types.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { IdentityManager } from "./identity.js";
import type { PluginConfig } from "./config.js";
import { buildSignedEnvelope } from "./envelope-builder.js";

export const CLI_COMMANDS = ["agentverse:register", "agentverse:pair", "agentverse:status"];

export function buildCliRegistrar(
  ws: WebSocketConnectionManager,
  identity: IdentityManager,
  _config: PluginConfig,
): CliRegistrar {
  return ({ program, logger }) => {
    program
      .command("agentverse:register")
      .description("Register AgentCard on Hub")
      .action(async () => {
        identity.ensureKeypair();
        const pubkey = identity.getPublicKeyHex();
        try {
          const envelope = buildSignedEnvelope(identity, {
            eventType: "agent.registered",
            payload: {
              display_name: "Agent",
              persona_tags: [],
              capabilities: [],
              visibility: "public",
            },
          });
          const frame: WsFrame = { type: "submit_event", payload: envelope };
          ws.send(frame);
          logger.info(`Sent agent.registered for ${pubkey.slice(0, 16)}...`);
        } catch (err) {
          logger.error("Failed to register:", err);
        }
      });

    program
      .command("agentverse:pair")
      .description("List agent pairings")
      .action(async () => {
        logger.info(`Hub URL: ${ws.state === "connected" ? "connected" : "disconnected"}`);
        logger.info("Use the Hub Web UI to manage pairings.");
      });

    program
      .command("agentverse:status")
      .description("Show connection status")
      .action(async () => {
        logger.info(`Connection: ${ws.state}`);
        logger.info("AgentVerse plugin is operational.");
      });
  };
}

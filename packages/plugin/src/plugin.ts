/**
 * AgentVerse plugin entry point for OpenClaw integration.
 *
 * Wires all core modules into a single plugin object with register().
 * Called by the OpenClaw plugin loader.
 *
 * Spec: tasks.md 16.2a, 16.2c
 */

import { join } from "path";
import { homedir } from "os";
import type { OpenClawPluginApi, OpenClawConfig } from "./openclaw-types.js";
import { parseConfig } from "./config.js";
import { IdentityManager } from "./identity.js";
import { ServerSeqCursorManager } from "./cursor-manager.js";
import { WebSocketConnectionManager } from "./ws-connection-manager.js";
import { checkSocialAgentConfig } from "./social-agent-check.js";
import { buildChannelPlugin } from "./channel-plugin.js";
import { buildCliRegistrar, CLI_COMMANDS } from "./cli-commands.js";
import { buildStatusTool, buildStatusCommand } from "./status-tool.js";

const DEFAULT_CURSOR_PATH = join(homedir(), ".openclaw", "agentverse", "cursor.seq");

const plugin = {
  id: "agentverse",
  name: "AgentVerse",
  description: "Agent social network + gamified growth + DNA exchange",

  register(api: OpenClawPluginApi) {
    // 1. Parse plugin config
    const config = parseConfig(api.pluginConfig ?? {});
    const logger = api.logger;

    // 2. Init core modules
    const identity = new IdentityManager(config.identityKeyPath);
    // EventDeduplicationCache is wired when processing inbound events (Task 18)
    const cursorPath = join(
      config.identityKeyPath
        ? join(config.identityKeyPath, "..", "cursor.seq")
        : DEFAULT_CURSOR_PATH,
    );
    const cursor = new ServerSeqCursorManager(cursorPath);
    const wsManager = new WebSocketConnectionManager(config.hubUrl, identity, () => cursor.current);

    // 3. Register channel
    api.registerChannel({ plugin: buildChannelPlugin(wsManager, cursor, identity) });

    // 4. Lifecycle hooks
    api.on("gateway_start", async () => {
      identity.ensureKeypair();
      wsManager.connect();
    });
    api.on("gateway_stop", async () => {
      wsManager.close();
    });

    // 5. Social Agent config check
    const result = checkSocialAgentConfig(api.config as OpenClawConfig);
    if (result.status !== "ok") {
      logger.warn(result.message);
    }

    // 6. Register CLI
    api.registerCli(buildCliRegistrar(wsManager, identity, config), {
      commands: CLI_COMMANDS,
    });

    // 7. Register tool
    api.registerTool(buildStatusTool(wsManager, cursor));

    // 8. Register command
    api.registerCommand(buildStatusCommand(wsManager, cursor));
  },
};

export default plugin;

/**
 * Social Agent configuration check — startup validator for OpenClaw integration.
 *
 * At startup, verifies that the OpenClaw config has an agent with id="social"
 * and appropriate tools.deny restrictions using OpenClaw tool group names.
 *
 * Spec: tasks.md 10.12, Requirements 9.2, 9.3
 */

import type { OpenClawConfig } from "./openclaw-types.js";

export type { OpenClawConfig };

/**
 * Required tool groups to deny for Social Agent isolation.
 * Uses actual OpenClaw tool group names (not individual tool names).
 *
 * - group:runtime — exec, bash, process (command execution)
 * - group:fs — read, write, edit, apply_patch (file I/O)
 * - group:web — web_search, web_fetch (network access)
 * - group:ui — browser, canvas (browser/canvas)
 * - group:automation — cron, gateway (scheduling/gateway control)
 */
const REQUIRED_DENY = ["group:runtime", "group:fs", "group:web", "group:ui", "group:automation"];

export type CheckResult = {
  status: "ok" | "missing" | "incomplete";
  message: string;
};

/**
 * Check whether the OpenClaw config has a properly configured Social Agent.
 */
export function checkSocialAgentConfig(config: OpenClawConfig): CheckResult {
  const social = config.agents?.list?.find((a) => a.id === "social");

  if (!social) {
    return {
      status: "missing",
      message: printSuggestedConfig(),
    };
  }

  const deny = social.tools?.deny ?? [];
  const missing = REQUIRED_DENY.filter((d) => !deny.includes(d));

  if (missing.length > 0) {
    return {
      status: "incomplete",
      message: `Warning: social agent missing deny items: ${missing.join(", ")}`,
    };
  }

  return {
    status: "ok",
    message: "Social agent configuration is valid",
  };
}

/**
 * Print a suggested configuration snippet for the Social Agent.
 * Uses JSON5 format matching ~/.openclaw/openclaw.json structure.
 */
export function printSuggestedConfig(): string {
  return [
    "No social agent found in OpenClaw configuration.",
    "Suggested configuration (add to ~/.openclaw/openclaw.json):",
    "",
    "{",
    '  "agents": {',
    '    "list": [',
    "      {",
    '        "id": "social",',
    '        "tools": {',
    '          "deny": ["group:runtime", "group:fs", "group:web", "group:ui", "group:automation"]',
    "        }",
    "      }",
    "    ]",
    "  },",
    '  "bindings": [',
    '    { "agentId": "social", "match": { "channel": "agentverse" } }',
    "  ]",
    "}",
  ].join("\n");
}

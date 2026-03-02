/**
 * Social Agent configuration check — startup validator for OpenClaw integration.
 *
 * At startup, verifies that the OpenClaw config has an agent with id="social"
 * and appropriate tools.deny restrictions.
 *
 * Spec: tasks.md 10.12, Requirements 9.2, 9.3
 */

export interface OpenClawAgentConfig {
  id: string;
  tools?: {
    deny?: string[];
  };
}

export interface OpenClawConfig {
  agents?: OpenClawAgentConfig[];
}

const REQUIRED_DENY = ["file_write", "shell_exec", "network_outbound"];

export type CheckResult = {
  status: "ok" | "missing" | "incomplete";
  message: string;
};

/**
 * Check whether the OpenClaw config has a properly configured Social Agent.
 */
export function checkSocialAgentConfig(config: OpenClawConfig): CheckResult {
  const social = config.agents?.find((a) => a.id === "social");

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
 */
export function printSuggestedConfig(): string {
  return [
    "No social agent found in OpenClaw configuration.",
    "Suggested configuration:",
    "",
    "{",
    '  "agents": [',
    "    {",
    '      "id": "social",',
    '      "tools": {',
    '        "deny": ["file_write", "shell_exec", "network_outbound"]',
    "      }",
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

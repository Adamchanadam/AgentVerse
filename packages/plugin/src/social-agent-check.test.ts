import { describe, it, expect } from "vitest";
import { checkSocialAgentConfig, printSuggestedConfig } from "./social-agent-check.js";

describe("checkSocialAgentConfig", () => {
  it("returns 'missing' when no agents configured", () => {
    const result = checkSocialAgentConfig({});
    expect(result.status).toBe("missing");
    expect(result.message).toContain("No social agent found");
  });

  it("returns 'missing' when agents exist but no social", () => {
    const result = checkSocialAgentConfig({
      agents: [{ id: "other" }],
    });
    expect(result.status).toBe("missing");
  });

  it("returns 'ok' when social agent has all required deny items", () => {
    const result = checkSocialAgentConfig({
      agents: [
        {
          id: "social",
          tools: {
            deny: ["file_write", "shell_exec", "network_outbound"],
          },
        },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.message).toBe("Social agent configuration is valid");
  });

  it("returns 'ok' when social agent has extra deny items beyond required", () => {
    const result = checkSocialAgentConfig({
      agents: [
        {
          id: "social",
          tools: {
            deny: ["file_write", "shell_exec", "network_outbound", "extra_thing"],
          },
        },
      ],
    });
    expect(result.status).toBe("ok");
  });

  it("returns 'incomplete' when social agent is missing some deny items", () => {
    const result = checkSocialAgentConfig({
      agents: [
        {
          id: "social",
          tools: { deny: ["file_write"] },
        },
      ],
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("shell_exec");
    expect(result.message).toContain("network_outbound");
  });

  it("returns 'incomplete' when social agent has no tools.deny", () => {
    const result = checkSocialAgentConfig({
      agents: [{ id: "social" }],
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("file_write");
    expect(result.message).toContain("shell_exec");
    expect(result.message).toContain("network_outbound");
  });
});

describe("printSuggestedConfig", () => {
  it("returns a valid JSON-like config snippet", () => {
    const output = printSuggestedConfig();
    expect(output).toContain('"social"');
    expect(output).toContain("file_write");
    expect(output).toContain("shell_exec");
    expect(output).toContain("network_outbound");
  });
});

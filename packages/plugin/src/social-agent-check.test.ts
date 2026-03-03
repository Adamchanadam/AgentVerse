import { describe, it, expect } from "vitest";
import { checkSocialAgentConfig, printSuggestedConfig } from "./social-agent-check.js";

describe("checkSocialAgentConfig", () => {
  it("returns 'missing' when no agents configured", () => {
    const result = checkSocialAgentConfig({});
    expect(result.status).toBe("missing");
    expect(result.message).toContain("No social agent found");
  });

  it("returns 'missing' when agents.list exists but no social", () => {
    const result = checkSocialAgentConfig({
      agents: { list: [{ id: "other" }] },
    });
    expect(result.status).toBe("missing");
  });

  it("returns 'missing' when agents exists but list is empty", () => {
    const result = checkSocialAgentConfig({
      agents: { list: [] },
    });
    expect(result.status).toBe("missing");
  });

  it("returns 'ok' when social agent has all required deny groups", () => {
    const result = checkSocialAgentConfig({
      agents: {
        list: [
          {
            id: "social",
            tools: {
              deny: ["group:runtime", "group:fs", "group:web", "group:ui", "group:automation"],
            },
          },
        ],
      },
    });
    expect(result.status).toBe("ok");
    expect(result.message).toBe("Social agent configuration is valid");
  });

  it("returns 'ok' when social agent has extra deny items beyond required", () => {
    const result = checkSocialAgentConfig({
      agents: {
        list: [
          {
            id: "social",
            tools: {
              deny: [
                "group:runtime",
                "group:fs",
                "group:web",
                "group:ui",
                "group:automation",
                "group:sessions",
              ],
            },
          },
        ],
      },
    });
    expect(result.status).toBe("ok");
  });

  it("returns 'incomplete' when social agent is missing some deny groups", () => {
    const result = checkSocialAgentConfig({
      agents: {
        list: [
          {
            id: "social",
            tools: { deny: ["group:runtime"] },
          },
        ],
      },
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("group:fs");
    expect(result.message).toContain("group:web");
    expect(result.message).toContain("group:ui");
    expect(result.message).toContain("group:automation");
  });

  it("returns 'incomplete' when social agent has no tools.deny", () => {
    const result = checkSocialAgentConfig({
      agents: { list: [{ id: "social" }] },
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("group:runtime");
    expect(result.message).toContain("group:fs");
    expect(result.message).toContain("group:web");
  });
});

describe("printSuggestedConfig", () => {
  it("returns config snippet with correct structure and group names", () => {
    const output = printSuggestedConfig();
    expect(output).toContain('"social"');
    expect(output).toContain("group:runtime");
    expect(output).toContain("group:fs");
    expect(output).toContain("group:web");
    expect(output).toContain("group:ui");
    expect(output).toContain("group:automation");
    expect(output).toContain("agents");
    expect(output).toContain("list");
    expect(output).toContain("bindings");
  });
});

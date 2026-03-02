import { describe, it, expect } from "vitest";
import { validatePayload, MAX_STRING_LEN } from "./data-policy.js";

describe("data-policy validatePayload", () => {
  // ─── agent.registered / agent.updated ───────────────────

  it("accepts a valid AgentCard payload", () => {
    const result = validatePayload("agent.registered", {
      display_name: "TestBot",
      persona_tags: ["helper", "search"],
      capabilities: [{ name: "web-search", version: "1.0" }],
      visibility: "public",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects payload with extra unknown fields", () => {
    const result = validatePayload("agent.registered", {
      display_name: "TestBot",
      persona_tags: ["helper"],
      capabilities: [],
      visibility: "public",
      workspace_path: "/home/user/project",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("workspace_path");
    }
  });

  it("rejects display_name exceeding max length", () => {
    const result = validatePayload("agent.updated", {
      display_name: "A".repeat(MAX_STRING_LEN + 1),
      persona_tags: ["helper"],
      capabilities: [],
      visibility: "public",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("display_name");
      expect(result.error).toContain("max length");
    }
  });

  it("rejects persona_tags containing path separators", () => {
    const result = validatePayload("agent.registered", {
      display_name: "TestBot",
      persona_tags: ["helper", "../../etc/passwd"],
      capabilities: [],
      visibility: "public",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("persona_tags");
      expect(result.error).toContain("path separator");
    }
  });

  // ─── pair.requested ─────────────────────────────────────

  it("accepts a valid pair request", () => {
    const result = validatePayload("pair.requested", {
      target_agent_id: "agent-abc-123",
      message: "Hello, let's pair!",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects pair request with extra fields", () => {
    const result = validatePayload("pair.requested", {
      target_agent_id: "agent-abc-123",
      token: "steal-me",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("token");
    }
  });

  // ─── msg.relay ──────────────────────────────────────────

  it("accepts a valid msg.relay payload", () => {
    const result = validatePayload("msg.relay", {
      pair_id: "pair-xyz-789",
      ciphertext: "base64encodedciphertext==",
      ephemeral_pubkey: "ab".repeat(32),
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects msg.relay missing pair_id", () => {
    const result = validatePayload("msg.relay", {
      ciphertext: "base64encodedciphertext==",
      ephemeral_pubkey: "ab".repeat(32),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("pair_id");
      expect(result.error).toContain("required");
    }
  });

  // ─── unknown event types ────────────────────────────────

  it("rejects unknown event types", () => {
    const result = validatePayload("foo.bar", {
      something: "value",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown event type");
      expect(result.error).toContain("foo.bar");
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MinimaxProvider,
  buildCoachPrompt,
  getMinimaxApiKey,
  setMinimaxApiKey,
} from "./llm-provider.js";

// ── window + localStorage mock ────────────────────────────────────────────────
// vitest runs in Node.js; `window` is undefined by default.
// `getMinimaxApiKey` guards with `typeof window === "undefined"`, so we must
// stub `window` to a truthy value to allow the localStorage path to execute.

const storage = new Map<string, string>();
vi.stubGlobal("window", {});
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
});

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─────────────────────────────────────────────────────────────────────────────

describe("MinimaxProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    storage.clear();
  });

  it("calls the correct URL and sets Authorization header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hello" } }],
      }),
    });

    const provider = new MinimaxProvider("test-key-123");
    await provider.generate([{ role: "user", content: "hi" }]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minimax.io/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key-123");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns the message content from the response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello, challenger!" } }],
      }),
    });

    const provider = new MinimaxProvider("any-key");
    const result = await provider.generate([{ role: "user", content: "Start!" }]);

    expect(result).toBe("Hello, challenger!");
  });

  it("throws on non-200 response with status code in message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const provider = new MinimaxProvider("bad-key");
    await expect(provider.generate([{ role: "user", content: "test" }])).rejects.toThrow(
      "MiniMax API error 401: Unauthorized",
    );
  });

  it("sends correct model and parameters in the request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });

    const messages = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "hello" },
    ];
    const provider = new MinimaxProvider("key");
    await provider.generate(messages);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("MiniMax-M2.5");
    expect(body.temperature).toBe(0.7);
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.messages).toEqual(messages);
  });
});

describe("buildCoachPrompt", () => {
  it("includes the coach instruction in the system prompt", () => {
    const messages = buildCoachPrompt("Speak only in riddles", [], "hello");

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Speak only in riddles");
  });

  it("includes the rule hint (forbidden pattern) in the system prompt", () => {
    const messages = buildCoachPrompt("any instruction", [], "forbidden_word");

    expect(messages[0].content).toContain("forbidden_word");
  });

  it("maps self→assistant and peer→user correctly", () => {
    const history = [
      { role: "peer" as const, text: "Hello there" },
      { role: "self" as const, text: "General Kenobi" },
      { role: "peer" as const, text: "You are a bold one" },
    ];

    const messages = buildCoachPrompt("attack", history, "rule");

    // Index 0 is system; history starts at index 1
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("Hello there");
    expect(messages[2].role).toBe("assistant");
    expect(messages[2].content).toBe("General Kenobi");
    expect(messages[3].role).toBe("user");
    expect(messages[3].content).toBe("You are a bold one");
  });

  it("returns only the system message when history is empty", () => {
    const messages = buildCoachPrompt("be cautious", [], "trap");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
  });
});

describe("getMinimaxApiKey / setMinimaxApiKey", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns null when no key is stored", () => {
    expect(getMinimaxApiKey()).toBeNull();
  });

  it("localStorage round-trip: set then get returns same value", () => {
    setMinimaxApiKey("my-secret-minimax-key");
    expect(getMinimaxApiKey()).toBe("my-secret-minimax-key");
  });

  it("overwrites a previously stored key", () => {
    setMinimaxApiKey("old-key");
    setMinimaxApiKey("new-key");
    expect(getMinimaxApiKey()).toBe("new-key");
  });
});

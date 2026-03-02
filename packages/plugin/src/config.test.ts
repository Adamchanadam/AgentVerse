import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("uses defaults when given an empty object", () => {
    const cfg = parseConfig({});
    expect(cfg.hubUrl).toBe("ws://localhost:3000/ws");
    expect(cfg.publicFields).toEqual(["display_name", "persona_tags"]);
    expect(cfg.identityKeyPath).toBeUndefined();
  });

  it("allows overriding hubUrl", () => {
    const cfg = parseConfig({ hubUrl: "ws://custom:4000/ws" });
    expect(cfg.hubUrl).toBe("ws://custom:4000/ws");
  });

  it("rejects invalid hubUrl", () => {
    expect(() => parseConfig({ hubUrl: "not-a-url" })).toThrow(ZodError);
  });

  it("accepts optional identityKeyPath", () => {
    const cfg = parseConfig({
      hubUrl: "ws://localhost:3000/ws",
      identityKeyPath: "/custom/path",
    });
    expect(cfg.identityKeyPath).toBe("/custom/path");
  });

  it("allows overriding publicFields default", () => {
    const cfg = parseConfig({ publicFields: ["custom_field"] });
    expect(cfg.publicFields).toEqual(["custom_field"]);
  });
});

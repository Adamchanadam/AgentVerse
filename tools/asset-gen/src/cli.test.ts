import { describe, it, expect } from "vitest";
import { parseCliArgs } from "./cli.js";

// ── parseCliArgs ────────────────────────────────────────────────────────────

describe("parseCliArgs", () => {
  it("mode is always 'placeholder'", () => {
    const opts = parseCliArgs([]);
    expect(opts.mode).toBe("placeholder");
  });

  it("--pack custom-pack sets pack", () => {
    const opts = parseCliArgs(["--pack", "custom-pack"]);
    expect(opts.pack).toBe("custom-pack");
  });

  it("defaults pack to 'mvp-default'", () => {
    const opts = parseCliArgs([]);
    expect(opts.pack).toBe("mvp-default");
  });

  it("--dry-run sets dryRun to true", () => {
    const opts = parseCliArgs(["--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("defaults dryRun to false", () => {
    const opts = parseCliArgs([]);
    expect(opts.dryRun).toBe(false);
  });

  it("-p alias works for --pack", () => {
    const opts = parseCliArgs(["-p", "other-pack"]);
    expect(opts.pack).toBe("other-pack");
  });

  it("--force sets force to true", () => {
    const opts = parseCliArgs(["--force"]);
    expect(opts.force).toBe(true);
  });

  it("defaults force to false", () => {
    const opts = parseCliArgs([]);
    expect(opts.force).toBe(false);
  });
});

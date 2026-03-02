import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseSize, parseAssetPackYaml } from "./yaml-parser.js";
import type { AssetCategory } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YAML_PATH = path.resolve(__dirname, "..", "items", "mvp-default.yaml");

// ── parseSize ───────────────────────────────────────────────────────────────

describe("parseSize", () => {
  it("parses '64x64' correctly", () => {
    const size = parseSize("64x64");
    expect(size).toEqual({ width: 64, height: 64 });
  });

  it("parses '320x180' correctly", () => {
    const size = parseSize("320x180");
    expect(size).toEqual({ width: 320, height: 180 });
  });

  it("throws on invalid format 'invalid'", () => {
    expect(() => parseSize("invalid")).toThrow();
  });

  it("throws on missing separator '64'", () => {
    expect(() => parseSize("64")).toThrow();
  });
});

// ── parseAssetPackYaml ──────────────────────────────────────────────────────

describe("parseAssetPackYaml", () => {
  it("parses mvp-default.yaml and returns 10 items", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    expect(spec.items).toHaveLength(10);
  });

  it("includes all expected categories in defaults.by_category", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    const categories: AssetCategory[] = ["avatars", "badges", "card_frames", "backgrounds"];
    for (const cat of categories) {
      expect(spec.defaults.by_category[cat]).toBeDefined();
      expect(spec.defaults.by_category[cat].size.width).toBeGreaterThan(0);
      expect(spec.defaults.by_category[cat].size.height).toBeGreaterThan(0);
    }
  });

  it("resolves item sizes to AssetSize objects", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    for (const item of spec.items) {
      expect(typeof item.size.width).toBe("number");
      expect(typeof item.size.height).toBe("number");
      expect(item.size.width).toBeGreaterThan(0);
      expect(item.size.height).toBeGreaterThan(0);
    }
  });

  it("parses generation modes with prompt_suffix and palette override", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    const { placeholder, final } = spec.generation.modes;

    expect(placeholder.prompt_suffix).toContain("PLACEHOLDER");
    expect(placeholder.palette_max_colors_override).toBe(4);

    expect(final.prompt_suffix).toContain("FINAL");
    expect(final.palette_max_colors_override).toBe(256);
  });

  it("throws for non-existent file", () => {
    expect(() => parseAssetPackYaml("/nonexistent/path/fake.yaml")).toThrow();
  });
});

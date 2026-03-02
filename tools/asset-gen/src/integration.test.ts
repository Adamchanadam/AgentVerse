import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { parseAssetPackYaml } from "./yaml-parser.js";
import { generateManifest } from "./manifest-generator.js";
import { generatePlaceholderPng } from "./placeholder-gen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YAML_PATH = path.resolve(__dirname, "..", "items", "mvp-default.yaml");

// ── Test isolation ──────────────────────────────────────────────────────────

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function createTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-gen-"));
  return tmpDir;
}

// ── Integration Tests ───────────────────────────────────────────────────────

describe("integration: placeholder mode end-to-end", () => {
  it("generates PNGs for all 10 items with correct dimensions", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    const outDir = createTmpDir();

    // Expected dimensions by id
    const expectedSizes: Record<string, { width: number; height: number }> = {
      avatar_default_01: { width: 64, height: 64 },
      avatar_default_02: { width: 64, height: 64 },
      avatar_default_03: { width: 64, height: 64 },
      badge_first_pair: { width: 32, height: 32 },
      badge_security_guard: { width: 32, height: 32 },
      badge_messenger: { width: 32, height: 32 },
      badge_trial_pass: { width: 32, height: 32 },
      icon_genepack_node: { width: 32, height: 32 },
      frame_basic: { width: 320, height: 180 },
      bg_agentdex_tile: { width: 128, height: 128 },
    };

    expect(spec.items).toHaveLength(10);

    for (const item of spec.items) {
      const buf = generatePlaceholderPng(item);
      const outPath = path.join(outDir, `${item.id}.png`);
      fs.writeFileSync(outPath, buf);

      // Read back and verify dimensions
      const png = PNG.sync.read(fs.readFileSync(outPath));
      const expected = expectedSizes[item.id];
      expect(expected, `missing expected size for ${item.id}`).toBeDefined();
      expect(png.width).toBe(expected!.width);
      expect(png.height).toBe(expected!.height);
    }
  });

  it("generates manifest with correct category counts (3 avatars, 5 badges, 1 card_frames, 1 backgrounds)", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    const manifest = generateManifest("mvp-default", spec.items);

    expect(manifest.id).toBe("mvp-default");
    expect(manifest.version).toBe("1.0.0");

    // Category counts
    expect(manifest.assets.avatars).toHaveLength(3);
    expect(manifest.assets.badges).toHaveLength(5);
    expect(manifest.assets.card_frames).toHaveLength(1);
    expect(manifest.assets.backgrounds).toHaveLength(1);

    // Total entries
    const total = Object.values(manifest.assets).flat().length;
    expect(total).toBe(10);

    // Verify avatar IDs
    const avatarIds = manifest.assets.avatars!.map((e) => e.id);
    expect(avatarIds).toContain("avatar_default_01");
    expect(avatarIds).toContain("avatar_default_02");
    expect(avatarIds).toContain("avatar_default_03");

    // Verify badge IDs
    const badgeIds = manifest.assets.badges!.map((e) => e.id);
    expect(badgeIds).toContain("badge_first_pair");
    expect(badgeIds).toContain("badge_security_guard");
    expect(badgeIds).toContain("badge_messenger");
    expect(badgeIds).toContain("badge_trial_pass");
    expect(badgeIds).toContain("icon_genepack_node");

    // Verify paths follow "{category}/{id}.png" format
    for (const [category, entries] of Object.entries(manifest.assets)) {
      for (const entry of entries) {
        expect(entry.path).toBe(`${category}/${entry.id}.png`);
      }
    }
  });

  it("all generated PNGs are valid (PNG.sync.read does not throw)", () => {
    const spec = parseAssetPackYaml(YAML_PATH);
    const outDir = createTmpDir();

    for (const item of spec.items) {
      const buf = generatePlaceholderPng(item);
      const outPath = path.join(outDir, `${item.id}.png`);
      fs.writeFileSync(outPath, buf);

      // Must not throw — valid PNG
      expect(() => {
        PNG.sync.read(fs.readFileSync(outPath));
      }).not.toThrow();
    }
  });
});

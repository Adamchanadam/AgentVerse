import { describe, it, expect } from "vitest";
import { generateManifest, mergeManifest } from "./manifest-generator.js";
import type { AssetItem, AssetManifest } from "./types.js";

// ── helpers ─────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<AssetItem> & { id: string; category: AssetItem["category"] },
): AssetItem {
  return {
    size: { width: 64, height: 64 },
    theme: "retro",
    use_case: "default",
    transparentBackground: true,
    ...overrides,
  };
}

// ── generateManifest ────────────────────────────────────────────────────────

describe("generateManifest", () => {
  it("produces correct top-level structure (id, version, name, assets)", () => {
    const items: AssetItem[] = [makeItem({ id: "avatar_default_01", category: "avatars" })];
    const manifest = generateManifest("mvp-default", items);

    expect(manifest.id).toBe("mvp-default");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.name).toBe("mvp-default");
    expect(manifest.assets).toBeDefined();
    expect(typeof manifest.assets).toBe("object");
  });

  it("builds paths as {category}/{id}.png", () => {
    const items: AssetItem[] = [
      makeItem({ id: "avatar_default_01", category: "avatars" }),
      makeItem({ id: "badge_first_pair", category: "badges" }),
      makeItem({ id: "frame_basic", category: "card_frames" }),
      makeItem({ id: "bg_agentdex_tile", category: "backgrounds" }),
    ];
    const manifest = generateManifest("test-pack", items);

    expect(manifest.assets["avatars"]![0]!.path).toBe("avatars/avatar_default_01.png");
    expect(manifest.assets["badges"]![0]!.path).toBe("badges/badge_first_pair.png");
    expect(manifest.assets["card_frames"]![0]!.path).toBe("card_frames/frame_basic.png");
    expect(manifest.assets["backgrounds"]![0]!.path).toBe("backgrounds/bg_agentdex_tile.png");
  });

  it("groups items by category correctly", () => {
    const items: AssetItem[] = [
      makeItem({ id: "avatar_default_01", category: "avatars" }),
      makeItem({ id: "avatar_default_02", category: "avatars" }),
      makeItem({ id: "badge_first_pair", category: "badges" }),
      makeItem({ id: "frame_basic", category: "card_frames" }),
    ];
    const manifest = generateManifest("test-pack", items);

    expect(manifest.assets["avatars"]).toHaveLength(2);
    expect(manifest.assets["badges"]).toHaveLength(1);
    expect(manifest.assets["card_frames"]).toHaveLength(1);
    // backgrounds not present in items — should not appear
    expect(manifest.assets["backgrounds"]).toBeUndefined();
  });
});

// ── mergeManifest ───────────────────────────────────────────────────────────

describe("mergeManifest", () => {
  it("preserves entries from existing manifest not present in generated", () => {
    const generated: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "mvp-default",
      assets: {
        badges: [{ id: "badge_first_pair", path: "badges/badge_first_pair.png" }],
      },
    };
    const existing: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "MVP Default",
      assets: {
        badges: [
          { id: "badge_first_pair", path: "badges/badge_first_pair.png", label: "First Pair" },
          { id: "badge_trial_pass", path: "badges/badge_trial_pass.png", label: "Trial Approved" },
          {
            id: "icon_genepack_node",
            path: "badges/icon_genepack_node.png",
            label: "GenePack Module",
          },
        ],
      },
    };

    const merged = mergeManifest(generated, existing);

    // badge_trial_pass and icon_genepack_node should be preserved from existing
    const badgeIds = merged.assets["badges"]!.map((e) => e.id);
    expect(badgeIds).toContain("badge_first_pair");
    expect(badgeIds).toContain("badge_trial_pass");
    expect(badgeIds).toContain("icon_genepack_node");
    expect(merged.assets["badges"]).toHaveLength(3);

    // Preserved entries keep their original label/tags
    const trialPass = merged.assets["badges"]!.find((e) => e.id === "badge_trial_pass");
    expect(trialPass!.label).toBe("Trial Approved");
  });

  it("overwrites same ID with generated version (generated wins)", () => {
    const generated: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "mvp-default",
      assets: {
        badges: [{ id: "badge_first_pair", path: "badges/badge_first_pair.png" }],
      },
    };
    const existing: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "MVP Default",
      assets: {
        badges: [
          {
            id: "badge_first_pair",
            path: "badges/badge_first_pair.png",
            label: "Old Label",
            tags: ["old"],
          },
        ],
      },
    };

    const merged = mergeManifest(generated, existing);

    const entry = merged.assets["badges"]!.find((e) => e.id === "badge_first_pair");
    // generated version has no label/tags — those should NOT carry over from existing
    expect(entry!.label).toBeUndefined();
    expect(entry!.tags).toBeUndefined();
  });

  it("handles empty existing manifest gracefully", () => {
    const generated: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "mvp-default",
      assets: {
        avatars: [{ id: "avatar_default_01", path: "avatars/avatar_default_01.png" }],
      },
    };
    const existing: AssetManifest = {
      id: "mvp-default",
      version: "1.0.0",
      name: "MVP Default",
      assets: {},
    };

    const merged = mergeManifest(generated, existing);

    // generated structure should be preserved as-is
    expect(merged.id).toBe("mvp-default");
    expect(merged.assets["avatars"]).toHaveLength(1);
    expect(merged.assets["avatars"]![0]!.id).toBe("avatar_default_01");
  });
});

import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { categoryColor, generatePlaceholderPng } from "./placeholder-gen.js";
import type { AssetCategory, AssetItem } from "./types.js";

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

function getPixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx]!, png.data[idx + 1]!, png.data[idx + 2]!, png.data[idx + 3]!];
}

// ── categoryColor ───────────────────────────────────────────────────────────

describe("categoryColor", () => {
  it("returns distinct colors per category", () => {
    const colors = new Map<string, [number, number, number, number]>();
    const categories: AssetCategory[] = ["avatars", "badges", "card_frames", "backgrounds"];

    for (const cat of categories) {
      colors.set(cat, categoryColor(cat));
    }

    // Each category should have a unique color (compare as strings for easy dedup)
    const unique = new Set([...colors.values()].map((c) => c.join(",")));
    expect(unique.size).toBe(4);
  });

  it("returns specific ANSI colors per category", () => {
    expect(categoryColor("avatars")).toEqual([85, 255, 255, 255]);
    expect(categoryColor("badges")).toEqual([255, 85, 255, 255]);
    expect(categoryColor("card_frames")).toEqual([255, 255, 85, 255]);
    expect(categoryColor("backgrounds")).toEqual([85, 85, 255, 255]);
  });

  it("returns gray fallback for unknown category", () => {
    const color = categoryColor("unknown_stuff" as AssetCategory);
    expect(color).toEqual([170, 170, 170, 255]);
  });
});

// ── generatePlaceholderPng ──────────────────────────────────────────────────

describe("generatePlaceholderPng", () => {
  it("produces a valid PNG buffer that pngjs can read back", () => {
    const item = makeItem({ id: "avatar_default_01", category: "avatars" });
    const buf = generatePlaceholderPng(item);
    expect(buf).toBeInstanceOf(Buffer);
    // Should not throw
    const png = PNG.sync.read(buf);
    expect(png.width).toBe(64);
    expect(png.height).toBe(64);
  });

  it("respects specified dimensions (64x64, 32x32, 320x180, 128x128)", () => {
    const cases = [
      { id: "avatar_01", category: "avatars" as AssetCategory, size: { width: 64, height: 64 } },
      { id: "badge_01", category: "badges" as AssetCategory, size: { width: 32, height: 32 } },
      {
        id: "frame_01",
        category: "card_frames" as AssetCategory,
        size: { width: 320, height: 180 },
      },
      { id: "bg_01", category: "backgrounds" as AssetCategory, size: { width: 128, height: 128 } },
    ];

    for (const c of cases) {
      const item = makeItem({ ...c });
      const buf = generatePlaceholderPng(item);
      const png = PNG.sync.read(buf);
      expect(png.width).toBe(c.size.width);
      expect(png.height).toBe(c.size.height);
    }
  });

  it("fills corner pixel with alpha=0 for transparent background items", () => {
    const item = makeItem({
      id: "avatar_transparent",
      category: "avatars",
      transparentBackground: true,
    });
    const buf = generatePlaceholderPng(item);
    const png = PNG.sync.read(buf);
    const [, , , a] = getPixel(png, 0, 0);
    expect(a).toBe(0);
  });

  it("fills corner pixel with alpha=255 for opaque background items", () => {
    const item = makeItem({
      id: "bg_opaque",
      category: "backgrounds",
      size: { width: 128, height: 128 },
      transparentBackground: false,
    });
    const buf = generatePlaceholderPng(item);
    const png = PNG.sync.read(buf);
    const [, , , a] = getPixel(png, 0, 0);
    expect(a).toBe(255);
  });

  it("draws center rectangle in category color at center pixel", () => {
    const item = makeItem({
      id: "avatar_center",
      category: "avatars",
      size: { width: 64, height: 64 },
      transparentBackground: true,
    });
    const buf = generatePlaceholderPng(item);
    const png = PNG.sync.read(buf);

    // Center pixel should be the category color (cyan for avatars)
    const cx = Math.floor(64 / 2);
    const cy = Math.floor(64 / 2);
    const [r, g, b, a] = getPixel(png, cx, cy);

    // avatars → cyan [85, 255, 255, 255]
    expect(r).toBe(85);
    expect(g).toBe(255);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });

  it("draws 1px border darker than category color around the rectangle", () => {
    // Use a large enough size that border is clearly separate from fill
    const item = makeItem({
      id: "frame_border",
      category: "card_frames",
      size: { width: 320, height: 180 },
      transparentBackground: true,
    });
    const buf = generatePlaceholderPng(item);
    const png = PNG.sync.read(buf);

    // card_frames → yellow [255, 255, 85, 255]
    // Border is darkened by 40%: Math.round(c * 0.6)
    // [Math.round(255*0.6), Math.round(255*0.6), Math.round(85*0.6), 255] = [153, 153, 51, 255]
    const expectedBorder: [number, number, number, number] = [153, 153, 51, 255];

    // The rectangle starts at 20% inset. For 320x180:
    // rx = Math.floor(320 * 0.2) = 64
    // ry = Math.floor(180 * 0.2) = 36
    // The border is the outer 1px of the rectangle
    // Top-left corner of rectangle border: (64, 36)
    const rx = Math.floor(320 * 0.2);
    const ry = Math.floor(180 * 0.2);
    const [r, g, b, a] = getPixel(png, rx, ry);

    expect([r, g, b, a]).toEqual(expectedBorder);
  });
});

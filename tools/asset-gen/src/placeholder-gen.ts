// @agentverse/asset-gen — Placeholder PNG generator
//
// Generates simple colored-rectangle PNGs for each AssetItem,
// suitable for dev/test use before final art assets are produced.

import { PNG } from "pngjs";
import type { AssetCategory, AssetItem } from "./types.js";

// ── Color Mapping ───────────────────────────────────────────────────────────

/** ANSI-palette color per asset category. Returns [R, G, B, A]. */
export function categoryColor(category: AssetCategory): [number, number, number, number] {
  switch (category) {
    case "avatars":
      return [85, 255, 255, 255]; // cyan
    case "badges":
      return [255, 85, 255, 255]; // magenta
    case "card_frames":
      return [255, 255, 85, 255]; // yellow
    case "backgrounds":
      return [85, 85, 255, 255]; // blue
    default:
      return [170, 170, 170, 255]; // gray fallback
  }
}

// ── Pixel Helpers ───────────────────────────────────────────────────────────

function setPixel(
  png: PNG,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

// ── PNG Generation ──────────────────────────────────────────────────────────

/**
 * Generate a placeholder PNG buffer for the given asset item.
 *
 * Layout:
 * - Background: transparent (RGBA 0,0,0,0) or category color at 30% opacity blended with black
 * - Center 60% rectangle: filled with category color
 * - 1px border around the rectangle: category color darkened by 40%
 */
export function generatePlaceholderPng(item: AssetItem): Buffer {
  const { width, height } = item.size;
  const png = new PNG({ width, height });

  const [cr, cg, cb] = categoryColor(item.category);

  // ── 1. Fill background ────────────────────────────────────────────────

  if (item.transparentBackground) {
    // Transparent: all zeros (RGBA 0,0,0,0) — PNG constructor already zeroes data
    // but be explicit for clarity
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setPixel(png, x, y, 0, 0, 0, 0);
      }
    }
  } else {
    // Opaque: category color at 30% opacity blended with black
    // blend = color * 0.3 + black * 0.7 = color * 0.3
    const bgR = Math.round(cr * 0.3);
    const bgG = Math.round(cg * 0.3);
    const bgB = Math.round(cb * 0.3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setPixel(png, x, y, bgR, bgG, bgB, 255);
      }
    }
  }

  // ── 2. Draw center 60% rectangle ─────────────────────────────────────

  // The rectangle occupies the central 60%, so 20% inset on each side
  const rx = Math.floor(width * 0.2);
  const ry = Math.floor(height * 0.2);
  const rw = width - 2 * rx; // 60% width
  const rh = height - 2 * ry; // 60% height

  // Fill the rectangle interior (inside the 1px border)
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      setPixel(png, x, y, cr, cg, cb, 255);
    }
  }

  // ── 3. Draw 1px darker border around the rectangle ───────────────────

  // Darken category color by 40%: multiply by 0.6
  const bR = Math.round(cr * 0.6);
  const bG = Math.round(cg * 0.6);
  const bB = Math.round(cb * 0.6);

  // Top and bottom edges
  for (let x = rx; x < rx + rw; x++) {
    setPixel(png, x, ry, bR, bG, bB, 255); // top
    setPixel(png, x, ry + rh - 1, bR, bG, bB, 255); // bottom
  }

  // Left and right edges
  for (let y = ry; y < ry + rh; y++) {
    setPixel(png, rx, y, bR, bG, bB, 255); // left
    setPixel(png, rx + rw - 1, y, bR, bG, bB, 255); // right
  }

  // ── 4. Encode to PNG buffer ──────────────────────────────────────────

  return PNG.sync.write(png);
}

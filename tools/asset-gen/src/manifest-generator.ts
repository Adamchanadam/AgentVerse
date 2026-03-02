// @agentverse/asset-gen — Manifest generation and merge utilities

import type { AssetItem, AssetManifest, ManifestAssetEntry } from "./types.js";

/**
 * Generate an AssetManifest from a pack ID and a list of AssetItems.
 *
 * Items are grouped by category, and each entry gets a relative path
 * of the form `{category}/{id}.png`.
 */
export function generateManifest(packId: string, items: AssetItem[]): AssetManifest {
  const assets: Record<string, ManifestAssetEntry[]> = {};

  for (const item of items) {
    const entry: ManifestAssetEntry = {
      id: item.id,
      path: `${item.category}/${item.id}.png`,
    };

    if (!assets[item.category]) {
      assets[item.category] = [];
    }
    assets[item.category].push(entry);
  }

  return {
    id: packId,
    version: "1.0.0",
    name: packId,
    assets,
  };
}

/**
 * Merge a generated manifest with an existing one.
 *
 * Strategy:
 * - For each category, generated entries take priority (overwrite by ID).
 * - Entries that exist in `existing` but NOT in `generated` are preserved
 *   (e.g., `badge_trial_pass` and `icon_genepack_node` that Antigravity
 *   added manually but are not yet in the YAML).
 * - The top-level id/version/name come from the generated manifest.
 */
export function mergeManifest(generated: AssetManifest, existing: AssetManifest): AssetManifest {
  // Collect all category keys from both manifests
  const allCategories = new Set([
    ...Object.keys(generated.assets),
    ...Object.keys(existing.assets),
  ]);

  const mergedAssets: Record<string, ManifestAssetEntry[]> = {};

  for (const category of allCategories) {
    const genEntries = generated.assets[category] ?? [];
    const existEntries = existing.assets[category] ?? [];

    // Build a set of IDs present in generated
    const genIds = new Set(genEntries.map((e) => e.id));

    // Start with all generated entries (they win for same ID)
    const merged: ManifestAssetEntry[] = [...genEntries];

    // Append existing entries whose IDs are NOT in generated
    for (const entry of existEntries) {
      if (!genIds.has(entry.id)) {
        merged.push(entry);
      }
    }

    mergedAssets[category] = merged;
  }

  return {
    id: generated.id,
    version: generated.version,
    name: generated.name,
    assets: mergedAssets,
  };
}

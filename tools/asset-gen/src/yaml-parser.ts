import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  AssetCategory,
  AssetItem,
  AssetPackSpec,
  AssetSize,
  CategoryDefaults,
  GenerationMode,
} from "./types.js";

const VALID_CATEGORIES: ReadonlySet<string> = new Set<AssetCategory>([
  "avatars",
  "badges",
  "card_frames",
  "backgrounds",
]);

/**
 * Parse a size string like "64x64" into an AssetSize object.
 * Throws if the format is invalid or dimensions are not positive integers.
 */
export function parseSize(sizeStr: string): AssetSize {
  const parts = sizeStr.split("x");
  if (parts.length !== 2) {
    throw new Error(`Invalid size format "${sizeStr}": expected "WIDTHxHEIGHT"`);
  }
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Invalid size format "${sizeStr}": width and height must be integers`);
  }
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid size format "${sizeStr}": width and height must be positive`);
  }
  return { width, height };
}

/**
 * Read and parse an asset pack YAML file into a fully typed AssetPackSpec.
 * Resolves size strings into AssetSize objects and validates categories.
 */
export function parseAssetPackYaml(yamlPath: string): AssetPackSpec {
  const content = readFileSync(yamlPath, "utf-8");
  const raw = parseYaml(content) as Record<string, unknown>;

  // --- style_base ---
  const styleBase = raw.style_base;
  if (typeof styleBase !== "string") {
    throw new Error("Missing or invalid 'style_base' in YAML");
  }

  // --- constraints ---
  const constraints = raw.constraints as Record<string, string> | undefined;
  if (!constraints || typeof constraints !== "object") {
    throw new Error("Missing or invalid 'constraints' in YAML");
  }

  // --- generation.modes ---
  const generation = raw.generation as { modes?: Record<string, unknown> } | undefined;
  if (!generation?.modes) {
    throw new Error("Missing 'generation.modes' in YAML");
  }
  const placeholderMode = parseGenerationMode(generation.modes, "placeholder");
  const finalMode = parseGenerationMode(generation.modes, "final");

  // --- defaults.by_category ---
  const defaults = raw.defaults as { by_category?: Record<string, unknown> } | undefined;
  if (!defaults?.by_category) {
    throw new Error("Missing 'defaults.by_category' in YAML");
  }
  const byCategory = {} as Record<AssetCategory, CategoryDefaults>;
  for (const [catKey, catVal] of Object.entries(defaults.by_category)) {
    if (!VALID_CATEGORIES.has(catKey)) {
      throw new Error(`Unknown category "${catKey}" in defaults.by_category`);
    }
    const catObj = catVal as Record<string, unknown>;
    byCategory[catKey as AssetCategory] = {
      size: parseSize(catObj.size as string),
      transparentBackground: Boolean(catObj.transparentBackground),
      tileable: Boolean(catObj.tileable),
    };
  }

  // --- items ---
  const rawItems = raw.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("Missing or invalid 'items' array in YAML");
  }
  const items: AssetItem[] = rawItems.map((rawItem: Record<string, unknown>, idx: number) => {
    const id = rawItem.id;
    if (typeof id !== "string") {
      throw new Error(`Item at index ${idx} missing 'id'`);
    }
    const category = rawItem.category as string;
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Item "${id}" has unknown category "${String(category)}"`);
    }
    const sizeStr = rawItem.size as string | undefined;
    let size: AssetSize;
    if (sizeStr) {
      size = parseSize(sizeStr);
    } else {
      // Fall back to category defaults
      const catDefaults = byCategory[category as AssetCategory];
      if (!catDefaults) {
        throw new Error(`Item "${id}" has no size and no category default for "${category}"`);
      }
      size = catDefaults.size;
    }
    return {
      id,
      category: category as AssetCategory,
      size,
      theme: String(rawItem.theme ?? ""),
      use_case: String(rawItem.use_case ?? ""),
      transparentBackground: Boolean(rawItem.transparentBackground),
    };
  });

  return {
    style_base: styleBase,
    constraints,
    generation: {
      modes: {
        placeholder: placeholderMode,
        final: finalMode,
      },
    },
    defaults: {
      by_category: byCategory,
    },
    items,
  };
}

function parseGenerationMode(modes: Record<string, unknown>, key: string): GenerationMode {
  const raw = modes[key] as Record<string, unknown> | undefined;
  if (!raw) {
    throw new Error(`Missing generation mode "${key}"`);
  }
  const promptSuffix = raw.prompt_suffix;
  if (typeof promptSuffix !== "string") {
    throw new Error(`Generation mode "${key}" missing or invalid 'prompt_suffix'`);
  }
  const paletteOverride = raw.palette_max_colors_override;
  if (typeof paletteOverride !== "number") {
    throw new Error(`Generation mode "${key}" missing or invalid 'palette_max_colors_override'`);
  }
  return {
    prompt_suffix: promptSuffix,
    palette_max_colors_override: paletteOverride,
  };
}

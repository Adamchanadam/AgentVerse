// @agentverse/asset-gen — Type declarations for Asset Gen CLI

/** Supported asset categories in a pack spec. */
export type AssetCategory = "avatars" | "badges" | "card_frames" | "backgrounds";

/** Pixel dimensions for an asset. */
export interface AssetSize {
  width: number;
  height: number;
}

/** A single asset item definition from the pack YAML. */
export interface AssetItem {
  id: string;
  category: AssetCategory;
  size: AssetSize;
  theme: string;
  use_case: string;
  transparentBackground: boolean;
}

/** Default settings for a specific asset category. */
export interface CategoryDefaults {
  size: AssetSize;
  transparentBackground: boolean;
  tileable: boolean;
}

/** Configuration for a generation mode (placeholder or final). */
export interface GenerationMode {
  prompt_suffix: string;
  palette_max_colors_override: number;
}

/** Fully parsed and validated asset pack specification. */
export interface AssetPackSpec {
  style_base: string;
  constraints: Record<string, string>;
  generation: {
    modes: {
      placeholder: GenerationMode;
      final: GenerationMode;
    };
  };
  defaults: {
    by_category: Record<AssetCategory, CategoryDefaults>;
  };
  items: AssetItem[];
}

/** A single entry in the output manifest. */
export interface ManifestAssetEntry {
  id: string;
  path: string;
  label?: string;
  tags?: string[];
}

/** Output manifest describing generated assets. */
export interface AssetManifest {
  id: string;
  version: string;
  name: string;
  assets: Record<string, ManifestAssetEntry[]>;
}

/** CLI invocation options. */
export interface CliOptions {
  mode: "placeholder";
  pack: string;
  dryRun: boolean;
  force: boolean;
}

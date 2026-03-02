// @agentverse/asset-gen — Barrel exports (public API)

export { parseSize, parseAssetPackYaml } from "./yaml-parser.js";
export { generateManifest, mergeManifest } from "./manifest-generator.js";
export { categoryColor, generatePlaceholderPng } from "./placeholder-gen.js";
export { parseCliArgs, run } from "./cli.js";
export type {
  AssetCategory,
  AssetSize,
  AssetItem,
  CategoryDefaults,
  GenerationMode,
  AssetPackSpec,
  ManifestAssetEntry,
  AssetManifest,
  CliOptions,
} from "./types.js";

// @agentverse/asset-gen — CLI entry point
//
// parseCliArgs: minimist-based argument parsing
// run: orchestration (parse YAML -> ensure dirs -> generate placeholders -> update manifest)

import fs from "node:fs";
import path from "node:path";
import minimist from "minimist";
import { parseAssetPackYaml } from "./yaml-parser.js";
import { generateManifest, mergeManifest } from "./manifest-generator.js";
import { generatePlaceholderPng } from "./placeholder-gen.js";
import type { AssetManifest, CliOptions } from "./types.js";

// ── Argument Parsing ────────────────────────────────────────────────────────

/**
 * Parse CLI argv (typically `process.argv.slice(2)`) into typed CliOptions.
 *
 * Supported flags:
 *   --pack, -p          Pack ID (default: "mvp-default")
 *   --dry-run           List what would be generated without writing files
 *   --force             Overwrite existing PNG files (default: skip existing)
 */
export function parseCliArgs(argv: string[]): CliOptions {
  const args = minimist(argv, {
    string: ["pack"],
    boolean: ["dry-run", "force"],
    default: { pack: "mvp-default", "dry-run": false, force: false },
    alias: { p: "pack" },
  });

  return {
    mode: "placeholder",
    pack: args.pack as string,
    dryRun: args["dry-run"] as boolean,
    force: args.force as boolean,
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

/**
 * Main orchestration: parse YAML, ensure output dirs, generate placeholders, write manifest.
 *
 * Path resolution uses process.cwd() as project root:
 *   YAML default:   {cwd}/tools/asset-gen/items/{pack}.yaml
 *   Output default: {cwd}/packages/hub/public/assets/{pack}/
 */
export async function run(opts: CliOptions): Promise<void> {
  const cwd = process.cwd();
  const yamlPath = path.join(cwd, "tools", "asset-gen", "items", `${opts.pack}.yaml`);
  const outputDir = path.join(cwd, "packages", "hub", "public", "assets", opts.pack);
  const manifestPath = path.join(outputDir, "manifest.json");

  // 1. Parse YAML spec
  const spec = parseAssetPackYaml(yamlPath);
  console.log(`Parsed ${spec.items.length} items from ${opts.pack}.yaml`);

  // 2. Generate manifest
  const generated = generateManifest(opts.pack, spec.items);

  // 3. Merge with existing manifest if present
  let manifest: AssetManifest;
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as AssetManifest;
    manifest = mergeManifest(generated, existing);
  } else {
    manifest = generated;
  }

  if (opts.dryRun) {
    console.log("Dry run — would generate:");
    for (const item of spec.items) {
      console.log(`  ${item.category}/${item.id}.png (${item.size.width}x${item.size.height})`);
    }
    console.log(`Manifest entries: ${Object.values(manifest.assets).flat().length}`);
    return;
  }

  // 4. Ensure category directories
  const categories = [...new Set(spec.items.map((i) => i.category))];
  for (const cat of categories) {
    fs.mkdirSync(path.join(outputDir, cat), { recursive: true });
  }

  // 5. Generate placeholder assets (skip existing unless --force)
  let generated_count = 0;
  let skipped_count = 0;
  for (const item of spec.items) {
    const outPath = path.join(outputDir, item.category, `${item.id}.png`);
    if (fs.existsSync(outPath) && !opts.force) {
      console.log(`  [skip] ${item.category}/${item.id}.png (exists, use --force to overwrite)`);
      skipped_count++;
      continue;
    }
    const buf = generatePlaceholderPng(item);
    fs.writeFileSync(outPath, buf);
    console.log(`  [ok] ${item.category}/${item.id}.png`);
    generated_count++;
  }
  if (skipped_count > 0) {
    console.log(`Skipped ${skipped_count} existing file(s). Use --force to overwrite.`);
  }
  console.log(`Generated ${generated_count} placeholder(s).`);

  // 6. Write manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest written: ${manifestPath}`);
}

// ── Auto-execute when run as CLI ─────────────────────────────────────────────

const isMain =
  process.argv[1] && (process.argv[1].endsWith("/cli.js") || process.argv[1].endsWith("\\cli.js"));

if (isMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  run(opts).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

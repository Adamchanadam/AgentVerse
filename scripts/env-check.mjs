#!/usr/bin/env node

/**
 * Fail-closed environment check.
 *
 * Verifies the required toolchain is present before development or CI work.
 * Run this inside the conda adamlab4_env environment:
 *   conda run -n adamlab4_env node scripts/env-check.mjs
 *   or:  pnpm env-check
 *
 * Exit code 0 = all checks pass
 * Exit code 1 = one or more checks failed (fail-closed)
 */

import { execSync } from "node:child_process";

const REQUIRED_NODE_MAJOR = 20;

let failed = false;

function check(label, fn) {
  try {
    const result = fn();
    console.log(`  ✅  ${label}: ${result}`);
  } catch {
    console.error(`  ❌  ${label}: NOT FOUND or failed`);
    failed = true;
  }
}

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

console.log("\n🔎  AgentVerse — Environment Check\n");

// ── Node.js ────────────────────────────────────────────────────
check("node version", () => {
  const raw = run("node --version"); // e.g. "v22.14.0"
  const major = parseInt(raw.replace(/^v/, "").split(".")[0], 10);
  if (major < REQUIRED_NODE_MAJOR) {
    throw new Error(`Node ${raw} < required v${REQUIRED_NODE_MAJOR}`);
  }
  return raw;
});

// ── pnpm ───────────────────────────────────────────────────────
check("pnpm version (package manager SSOT)", () => run("pnpm --version"));

// ── git ────────────────────────────────────────────────────────
check("git version", () => run("git --version"));

// ── Docker ────────────────────────────────────────────────────
check("docker version (required for postgres/compose)", () => {
  const v = run("docker --version");
  return v;
});

// ── Summary ───────────────────────────────────────────────────
console.log();
if (failed) {
  console.error(
    "❌  One or more required tools are missing.\n" +
      "    Activate the conda environment first:\n" +
      "      conda activate adamlab4_env\n" +
      "    Then install any missing tools listed above.\n",
  );
  process.exit(1);
} else {
  console.log("✅  All environment checks passed.\n");
}

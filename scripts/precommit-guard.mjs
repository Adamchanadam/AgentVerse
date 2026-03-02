#!/usr/bin/env node

/**
 * Pre-commit guard: fails if any staged changes are inside openclaw-main/.
 * Install as a pre-commit hook or call via `pnpm precommit`.
 */

import { execSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" });
const violations = staged.split("\n").filter((f) => f.startsWith("openclaw-main/"));

if (violations.length > 0) {
  console.error(
    "\n❌  openclaw-main/ is READ-ONLY. The following staged files violate this constraint:\n",
  );
  for (const v of violations) {
    console.error(`   ${v}`);
  }
  console.error("\nPlease unstage these files. All new code goes under packages/ or tools/.\n");
  process.exit(1);
}

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts", "tools/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "tools/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
    },
  },
});

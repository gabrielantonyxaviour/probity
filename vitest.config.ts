import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@schemas": path.resolve(__dirname, "app/schemas") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/ui/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

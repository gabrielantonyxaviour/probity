// Co-located lane tests. Root vitest include is tests/** only; see NEEDS.md.
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  root,
  resolve: { alias: { "@schemas": path.resolve(root, "app/schemas") } },
  test: {
    environment: "node",
    include: [
      "app/adapters/zetaris/**/*.test.ts",
      "app/templates/**/*.test.ts",
      "scripts/zetaris/**/*.test.ts",
    ],
    exclude: ["node_modules/**"],
  },
});

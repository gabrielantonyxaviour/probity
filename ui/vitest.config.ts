import { defineConfig } from "vitest/config";
import path from "node:path";

// UI unit tests: `npx vitest run --config ui/vitest.config.ts` from the repo root (the root config only covers tests/).
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@schemas": path.resolve(__dirname, "../app/schemas"),
      "@": path.resolve(__dirname),
    },
  },
  test: { environment: "node", include: ["lib/**/*.test.ts", "components/**/*.test.ts"], testTimeout: 15_000 },
});

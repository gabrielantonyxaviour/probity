import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "ui/next-env.d.ts",
      "logs/**",
      ".world/**",
      "uploads/**",
      "app/engines/world-model/**",
      "app/engines/hmem/**",
      "tests/engine/*/runner.ts",
      "vendor/meterless/**",
      "tests/engines/*/runner.ts",
      "tests/engines/hmem/vectors/**",
      "video/**",
      "ui/**", // ui/ lints itself: npm --prefix ui run lint (ui/eslint.config.mjs)
      "ui/.next*/**",
      "app/vendor/**",
      "data/**",
      "output_examples/**",
      "video/out/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, parserOptions: { tsconfigRootDir: import.meta.dirname } },
    rules: {
      "no-console": "error",
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["tests/**", "scripts/**", "bench/**"], rules: { "no-console": "off" } },
  {
    files: ["ui/**/*.{ts,tsx}", "video/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);

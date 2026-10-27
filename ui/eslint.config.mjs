import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// UI lint rules (brief: no-console is an error, files stay under 300 lines). Run with `npm run lint` in ui/.
export default tseslint.config(
  { ignores: ["node_modules/**", ".next*/**", "next-env.d.ts", "public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-console": "error",
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);

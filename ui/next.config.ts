import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  output: "standalone",
  // Parallel dev servers (landing lane, UI lane) must not share one build dir: NEXT_DIST_DIR picks a private one.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: here,
  // The UI imports the frozen zod contracts from ../app/schemas (06 section 9.2); every API response is zod-parsed.
  experimental: { externalDir: true },
  poweredByHeader: false,
  // Fixtures are a dev-only feature: pin the flag at build time so production bundles drop the fixture banner.
  env: { NEXT_PUBLIC_UI_FIXTURES: process.env.NEXT_PUBLIC_UI_FIXTURES ?? "0" },
  // Lint is its own script (`npm run lint`); the production image does not install eslint.
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    // The CLI prints /review/{run_id}; the product lives under /app (DESIGN_SYSTEM_RULES conflict 22).
    return [{ source: "/review/:id*", destination: "/app/review/:id*", permanent: false }];
  },
};

export default config;

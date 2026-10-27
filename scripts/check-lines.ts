// Every non-vendored source file is at most 300 lines, and production code has no console.* (06 §3, Gabriel's rules).
// Foundation-provided; Sol-A owns the file and may extend it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MAX = 300;
const SOURCE = /\.(ts|tsx|js|mjs|cjs|sh|css)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "logs",
  ".world",
  "uploads",
  "out",
  "test-results",
  "playwright-report",
]);
const EXEMPT: RegExp[] = [
  /^app\/engines\/(world-model|hmem)\//,
  /^tests\/engine\/[^/]+\/runner\.ts$/,
  /^vendor\/meterless\//,
  /^tests\/engines\/[^/]+\/runner\.ts$/,
  /^tests\/engines\/hmem\/vectors\//,
  /^data\//,
  /^db\/init\/02-seed\.sql$/,
  /^app\/vendor\//,
  /^output_examples\//,
  /^ui\/next-env\.d\.ts$/,
  /\.generated\./,
  /^zetaris\/register\/\.generated\//,
];
const CONSOLE_OK = /^(tests|scripts|bench)\//;
const CONSOLE = /\bconsole\.(log|info|warn|error|debug|trace)\b/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".next-")) continue; // private Next dev builds (NEXT_DIST_DIR)
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield path.relative(ROOT, full);
  }
}

const problems: string[] = [];
for (const rel of walk(ROOT)) {
  if (!SOURCE.test(rel) || EXEMPT.some((r) => r.test(rel))) continue;
  const text = readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  if (lines > MAX) problems.push(`${rel}: ${lines} lines (max ${MAX})`);
  if (!CONSOLE_OK.test(rel) && CONSOLE.test(text) && rel !== "scripts/check-lines.ts")
    problems.push(`${rel}: console.* in production code`);
}
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("check:lines ok\n");

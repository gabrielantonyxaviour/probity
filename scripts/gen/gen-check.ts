// npm run gen:check: regenerate seed and documents in memory and fail on drift (JSON/EML/TXT byte-equal; PNG/PDF page count, size +-3%).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "./manifest";

const run = (script: string, args: string[]): number => {
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, script), ...args], { stdio: "inherit", cwd: ROOT });
  return r.status ?? 1;
};
const failures = [run("scripts/gen/make-seed.ts", ["--check"]), run("scripts/gen/make-documents.ts", ["--check"])].filter((c) => c !== 0);
process.exit(failures.length === 0 ? 0 : 1);

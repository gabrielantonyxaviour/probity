// `npm run eval:nemotron` entry: runs the live Nemotron Letter Reader eval (24 real calls, about 10 to 15 minutes) and rewrites
// docs/evidence/nemotron-eval.{md,json}. It skips when no runtime token is configured. EVAL_OUT overrides the folder, EVAL_LETTERS (comma list) limits the letters.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const haveToken = (): boolean => {
  if (process.env.METERLESS_RUNTIME_TOKEN) return true;
  try {
    return /^METERLESS_RUNTIME_TOKEN=\S{8,}/m.test(readFileSync(path.join(root, ".env.local"), "utf8"));
  } catch {
    return false;
  }
};

describe.skipIf(!haveToken() || process.env.SAMPLE_MODE === "true")("Nemotron eval (live)", () => {
  it("runs 12 letters on both lanes and writes the evidence files", { timeout: 25 * 60_000 }, () => {
    const out = process.env.EVAL_OUT ?? "docs/evidence";
    const letters = process.env.EVAL_LETTERS ? ["--letters", process.env.EVAL_LETTERS] : [];
    const r = spawnSync("npx", ["tsx", "tests/eval/nemotron/run.ts", "--out", out, ...letters], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout.split("\n").filter((l) => /^\[\d+\/|^wrote/.test(l)).join("\n") + "\n");
    expect(r.status, r.stderr.slice(-800)).toBe(0);
    expect(existsSync(path.join(root, out, "nemotron-eval.json"))).toBe(true);
    const j = JSON.parse(readFileSync(path.join(root, out, "nemotron-eval.json"), "utf8")) as { calls: unknown[]; unique_apps_across_run: number };
    expect(j.calls).toHaveLength(process.env.EVAL_LETTERS ? process.env.EVAL_LETTERS.split(",").length * 2 : 24);
  });
});

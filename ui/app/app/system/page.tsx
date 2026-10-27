import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { parseModelPerStep, type ModelPerStep } from "@/lib/model-per-step";
import { SystemPage } from "@/components/system/SystemPage";

export const metadata: Metadata = { title: "System" };
export const dynamic = "force-dynamic";

/** The measured evidence file lives in the repo (docs/evidence); the UI runs from ui/, so look one level up first. */
async function loadEvidence(): Promise<{ data: ModelPerStep | null; source: string }> {
  const rel = "docs/evidence/model-per-step.json";
  const roots = [process.env.PROBITY_REPO_ROOT, path.resolve(process.cwd(), ".."), process.cwd()].filter((r): r is string => !!r);
  for (const root of roots) {
    try {
      const text = await readFile(path.join(root, rel), "utf8");
      return { data: parseModelPerStep(JSON.parse(text)), source: rel };
    } catch {
      // try the next root
    }
  }
  return { data: null, source: rel };
}

export default async function Page() {
  const { data, source } = await loadEvidence();
  return <SystemPage data={data} source={source} />;
}

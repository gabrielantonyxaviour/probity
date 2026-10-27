// Prompt loader: each prompt is its md file plus the GUARDRAILS block, appended verbatim (04 §6).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string>();

export type PromptName = "letter_reader" | "registry_scout" | "identity_examiner" | "describe_conflicts" | "gate_officer";

export function loadPrompt(name: PromptName): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const body = readFileSync(join(dir, `${name}.md`), "utf8").trim();
  const guard = readFileSync(join(dir, "GUARDRAILS.md"), "utf8").trim();
  const full = `${body}\n\n${guard}`;
  cache.set(name, full);
  return full;
}

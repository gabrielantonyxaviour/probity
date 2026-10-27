// Prompt loader: each prompt is its md file plus the GUARDRAILS block, appended verbatim (04 §6).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string>();

export type PromptName = "letter_reader" | "letter_reader_visual" | "injection_review" | "registry_scout" | "identity_examiner" | "describe_conflicts" | "gate_officer";

export function loadPrompt(name: PromptName): string {
  const hit = cache.get(name);
  if (hit) return hit;
  // The visual reading (D1 reading B) is the same rules with a different framing on top: vary the instructions, not the model.
  const body =
    name === "letter_reader_visual"
      ? `${readFileSync(join(dir, "letter_reader_visual.md"), "utf8").trim()}\n\n${readFileSync(join(dir, "letter_reader.md"), "utf8").trim()}`
      : readFileSync(join(dir, `${name}.md`), "utf8").trim();
  const guard = readFileSync(join(dir, "GUARDRAILS.md"), "utf8").trim();
  const full = `${body}\n\n${guard}`;
  cache.set(name, full);
  return full;
}

// Run from the repo root:  npx tsx video/scripts/check.ts
// Build-time assertions: total <= 235 s, narration <= 3.3 words/s per window (v2: each shot is its line + 0.7 s), clips.json covers every slot,
// no run-derived figure typed into a .tsx file, no file over 300 lines.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const VIDEO = resolve(import.meta.dirname, "..");
const DOCS = resolve(VIDEO, "../docs/video");
const rd = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

interface Script { motion: { id: string; seconds: number }[]; sequence: string[]; narration: { id: string; covers: string[]; text: string; text_fit?: string }[] }
interface Slots { cap_seconds: number; slots: { id: string; seconds: number; enabled: boolean }[] }
interface Clip { clip: string; run_id: string | null }
const script = rd<Script>(join(VIDEO, "script.json"));
const slots = rd<Slots>(join(DOCS, "slots.json"));
const clips = rd<Clip[]>(join(DOCS, "clips.json"));

let fail = 0;
const out = (ok: boolean, msg: string) => {
  if (!ok) fail++;
  process.stdout.write(`${ok ? "pass" : "FAIL"}  ${msg}\n`);
};

const len = new Map<string, number>();
for (const m of script.motion) len.set(m.id, m.seconds);
for (const s of slots.slots) len.set(s.id, s.enabled ? s.seconds : 0);
const total = script.sequence.reduce((a, id) => a + (len.get(id) ?? 0), 0);
out(total <= Math.min(235, slots.cap_seconds), `film length ${total.toFixed(2)} s (cap 235 s)`);

// Spoken length of the {{FILL}} tokens, as words (the real values come from facts.generated.json at recording time).
const FILL_WORDS: Record<string, number> = { days_before_payment_words: 1, exposure_millions: 4, sweep_count_words: 1, q8_seconds: 2 };
const words = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => " w".repeat(FILL_WORDS[k] ?? 1)).replace(/\$/g, "").split(/\s+/).filter(Boolean).length;
for (const n of script.narration) {
  const sec = n.covers.reduce((a, id) => a + (len.get(id) ?? 0), 0);
  if (sec === 0) {
    process.stdout.write(`skip  ${n.id} window collapsed (conditional slot disabled)\n`);
    continue;
  }
  const spoken = n.text_fit ?? n.text;
  const rate = words(spoken) / sec;
  out(rate <= 3.3, `${n.id} ${words(spoken)} words / ${sec} s = ${rate.toFixed(2)} w/s${n.text_fit ? ` (trimmed; verbatim ${(words(n.text) / sec).toFixed(2)})` : ""}`);
}

for (const s of slots.slots) {
  const c = clips.find((x) => x.clip === s.id);
  out(c !== undefined, `clips.json has an entry for ${s.id}${c?.run_id ? ` (run ${c.run_id})` : " (run_id pending the recording session)"}`);
}

const files: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    if (["node_modules", "out", "public", ".remotion"].includes(e)) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|py)$/.test(e)) files.push(p);
  }
};
walk(join(VIDEO, "src"));
walk(join(VIDEO, "scripts"));
const long = files.filter((f) => readFileSync(f, "utf8").split("\n").length > 300);
out(long.length === 0, `files over 300 lines: ${long.length ? long.join(", ") : "none"}`);
const typed = files.filter((f) => f.endsWith(".tsx") && /1,?284,?550|1\.28/.test(readFileSync(f, "utf8")));
out(typed.length === 0, `run-derived figures typed into .tsx: ${typed.length ? typed.join(", ") : "none"}`);
const logs = files.filter((f) => /console\.(log|info|debug)/.test(readFileSync(f, "utf8")) && !f.endsWith("check.ts"));
out(logs.length === 0, `console calls in src/scripts: ${logs.length ? logs.join(", ") : "none"}`);
process.exit(fail ? 1 : 0);

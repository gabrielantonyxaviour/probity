// Assembly: start card + walkthrough + end card (1920x1080 H.264 30 fps), the narration placed at each beat's mark,
// captions burned in from the ElevenLabs word timings. This ffmpeg has no subtitles or drawtext filter, so captions
// are transparent PNG strips (cards.ts) overlaid through a concat list.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { CaptionItem } from "./cards";
import { loadSeg, type Mark } from "./vo";

/** `cut` plays the span [from, to] of the walkthrough clip at `speed` times (the dead time while Zetaris answers the re-run). */
export type Plan = { startCard: number; main: number; endCard: number; marks: Array<Mark & { at: number }>; cut?: { from: number; to: number; speed: number } };

/** Respellings used only for the voice (tts.py PRONOUNCE) are shown with their real spelling on screen. */
const SHOW: Array<[RegExp, string]> = [
  [/seven oh three, nine oh two, five-zero-zero-zero/gi, "(703) 902-5000"],
  [/Nemmo-tron/g, "Nemotron"],
  [/Zuh-tarris/g, "Zetaris"],
  [/\bEdgar\b/g, "EDGAR"],
  [/L-three Harris/g, "L3Harris"],
  [/U\.S\.A\. spending/g, "USAspending"],
  [/\bNvidia\b/g, "NVIDIA"],
  [/(\d+) dollars/g, "$1 dollars"],
];

export function captionItems(plan: Plan): CaptionItem[] {
  const out: CaptionItem[] = [];
  for (const m of plan.marks) {
    const seg = loadSeg(m.id);
    let cur: typeof seg.words = [];
    const flush = () => {
      if (!cur.length) return;
      let text = cur.map((w) => w.word).join(" ");
      for (const [re, rep] of SHOW) text = text.replace(re, rep);
      out.push({ text, start: m.at + cur[0]!.start, end: m.at + cur[cur.length - 1]!.end + 0.3 });
      cur = [];
    };
    for (const w of seg.words) {
      cur.push(w);
      const sentenceEnd = /[.?!]$/.test(w.word) && !/^U\.S\.A\.$/.test(w.word);
      const chars = cur.map((x) => x.word).join(" ").length;
      if (sentenceEnd || cur.length >= 12 || chars >= 78) flush();
    }
    flush();
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length - 1; i++) out[i]!.end = Math.min(out[i]!.end, out[i + 1]!.start - 0.02);
  return out;
}

/** concat-demuxer list covering the whole timeline: a caption PNG while it is spoken, the blank strip otherwise. */
export function captionList(items: CaptionItem[], files: string[], blank: string, total: number, listFile: string): void {
  const rows: string[] = [];
  let t = 0;
  const add = (f: string, d: number) => {
    if (d > 0.001) rows.push(`file '${f}'\nduration ${d.toFixed(3)}`);
  };
  items.forEach((it, i) => {
    add(blank, it.start - t);
    add(files[i]!, it.end - it.start);
    t = it.end;
  });
  add(blank, total - t);
  rows.push(`file '${blank}'`);
  writeFileSync(listFile, `${rows.join("\n")}\n`);
}

export function mux(o: { start: string; main: string; end: string; plan: Plan; capList: string; out: string }): void {
  const { plan } = o;
  const total = plan.startCard + plan.main + plan.endCard;
  const mainChain = (pl: Plan): string[] => {
    const tail = `tpad=stop_mode=clone:stop_duration=90,trim=duration=${pl.main.toFixed(3)},fps=30,setpts=PTS-STARTPTS,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${(pl.main - 0.5).toFixed(3)}:d=0.5[v1]`;
    if (!pl.cut) return [`[1:v]${tail}`];
    const { from, to, speed } = pl.cut;
    return [
      "[1:v]fps=30,setpts=PTS-STARTPTS,split=3[m0][m1][m2]",
      `[m0]trim=end=${from},setpts=PTS-STARTPTS[p0]`,
      `[m1]trim=start=${from}:end=${to},setpts=(PTS-STARTPTS)/${speed}[p1]`,
      `[m2]trim=start=${to},setpts=PTS-STARTPTS[p2]`,
      `[p0][p1][p2]concat=n=3:v=1:a=0,${tail}`,
    ];
  };
  const fit = (i: number, d: number, fade: string) => `[${i}:v]tpad=stop_mode=clone:stop_duration=90,trim=duration=${d.toFixed(3)},fps=30,setpts=PTS-STARTPTS,format=yuv420p,${fade}[v${i}]`;
  const fadeIn = (d: number) => `fade=t=in:st=0:d=${d}`;
  const fadeOut = (dur: number, d: number) => `fade=t=out:st=${(dur - d).toFixed(3)}:d=${d}`;
  const filters = [
    fit(0, plan.startCard, `${fadeIn(0.5)},${fadeOut(plan.startCard, 0.5)}`),
    ...mainChain(plan),
    fit(2, plan.endCard, `${fadeIn(0.5)},${fadeOut(plan.endCard, 1.2)}`),
    "[v0][v1][v2]concat=n=3:v=1:a=0[vc]",
    "[3:v]format=rgba,fps=30[cap]",
    "[vc][cap]overlay=0:860:format=auto:eof_action=pass,format=yuv420p[vout]",
  ];
  const inputs = ["-i", o.start, "-i", o.main, "-i", o.end, "-f", "concat", "-safe", "0", "-i", o.capList];
  const labels: string[] = [];
  plan.marks.forEach((m, i) => {
    const seg = loadSeg(m.id);
    inputs.push("-i", seg.file);
    const ms = Math.round((plan.startCard + m.at) * 1000);
    filters.push(`[${4 + i}:a]adelay=${ms}:all=1[a${i}]`);
    labels.push(`[a${i}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${total.toFixed(3)}[aout]`);
  const script = `${o.out}.filters.txt`;
  writeFileSync(script, filters.join(";\n"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-/filter_complex", script, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", total.toFixed(3), o.out], { stdio: "inherit" });
}


// Narration segments (docs/video/insurance/audio/*.json, written by video/scripts/tts.py) and the clock that
// ties every pointer move to the word being spoken.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../env";

export type Word = { word: string; start: number; end: number };
export type Seg = { id: string; seconds: number; words: Word[]; file: string };

export const INS_DIR = path.join(ROOT, "docs/video/insurance");
export const AUDIO_DIR = path.join(INS_DIR, "audio");

export function loadSeg(id: string): Seg {
  const j = JSON.parse(readFileSync(path.join(AUDIO_DIR, `${id}.json`), "utf8")) as { seconds: number; words: Word[] };
  return { id, seconds: j.seconds, words: j.words, file: path.join(AUDIO_DIR, `${id}.m4a`) };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** The words in the sidecars are the respelled ones the voice was given (tts.py PRONOUNCE); cues are written with the real names. */
const SPOKEN: Record<string, string> = { zetaris: "zuhtarris", nemotron: "nemmotron", edgar: "edgar" };
const spoke = (w: string) => SPOKEN[bare(w)] ?? bare(w);

/** A narration segment that started playing at `startMs` (epoch ms on the capture clock). */
export class Clock {
  constructor(readonly seg: Seg, readonly startMs: number) {}

  /** Seconds since this segment began. */
  get t(): number {
    return (Date.now() - this.startMs) / 1000;
  }

  /** Start time of the first word of `phrase` (lower-case words, in order) at or after word index `from`. */
  wordAt(phrase: string, from = 0): number {
    const want = phrase.split(/\s+/).map(spoke);
    const w = this.seg.words;
    for (let i = from; i <= w.length - want.length; i++) {
      if (want.every((x, k) => bare(w[i + k]!.word) === x || bare(w[i + k]!.word).startsWith(x))) return w[i]!.start;
    }
    throw new Error(`phrase "${phrase}" not found in ${this.seg.id}`);
  }

  /** Wait until the phrase is about to be spoken; `lead` seconds early so a pointer move can arrive on the word. */
  async cue(phrase: string, lead = 0.5, from = 0): Promise<void> {
    const at = Math.max(0, this.wordAt(phrase, from) - lead);
    const ms = at * 1000 - (Date.now() - this.startMs);
    if (ms > 0) await sleep(ms);
  }

  /** Wait for the narration to finish, plus a short breath. */
  async end(tail = 0.6): Promise<void> {
    const ms = (this.seg.seconds + tail) * 1000 - (Date.now() - this.startMs);
    if (ms > 0) await sleep(ms);
  }
}

export type Mark = { id: string; epoch: number };

/** Records when each segment starts, on the wall clock the screencast frames are stamped with. */
export class Track {
  readonly marks: Mark[] = [];
  say(id: string): Clock {
    const seg = loadSeg(id);
    const now = Date.now();
    this.marks.push({ id, epoch: now / 1000 });
    return new Clock(seg, now);
  }
}

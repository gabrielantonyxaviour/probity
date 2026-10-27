import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import raw from "../data/captions.generated.json";
import { script } from "../data/script";
import { seg } from "../timeline/timeline";
import { C, FONT, VIDEO } from "../system/tokens";

// Cues from the narration sidecars (video/scripts/captions.py), in seconds from the start of each narration file.
const Cue = z.object({ text: z.string(), start: z.number(), end: z.number() });
const cuesById = z.record(z.string(), z.array(Cue)).parse(raw);
const GAP = 0.6; // a cue holds across a pause shorter than this, so captions do not flicker between phrases

interface Timed { text: string; from: number; to: number }
const timed: Timed[] = script.narration.flatMap((n) => {
  const first = n.covers.map((c) => seg(c)).find((s) => s.len > 0);
  const cues = cuesById[n.audio.split(".")[0]];
  if (!first || !cues) return [];
  return cues.map((c, i) => {
    const next = cues[i + 1];
    const end = next && next.start - c.end < GAP ? next.start : c.end + 0.25;
    return { text: c.text, from: first.start + Math.round(c.start * VIDEO.fps), to: first.start + Math.round(end * VIDEO.fps) };
  });
});

/** Burned-in captions of the narration, bottom centre, below every scene's content. */
export const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const cue = timed.find((c) => f >= c.from && f < c.to);
  if (!cue) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 104, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "rgba(12,12,11,0.9)", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ fontFamily: FONT.sans, fontWeight: 400, fontSize: 38, lineHeight: 1.2, color: C.fg, maxWidth: 1700, textAlign: "center" }}>
        {cue.text}
      </div>
    </div>
  );
};

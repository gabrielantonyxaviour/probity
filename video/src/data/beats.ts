import { z } from "zod";
import raw from "./beats.generated.json";

// Word-timed beats (frames from the start of a shot), written by video/scripts/beats.py from the ElevenLabs word timings.
export const beats = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())).parse(raw);
export const beat = (shot: string, label: string): number => {
  const v = beats[shot]?.[label];
  if (v === undefined) throw new Error(`beats.generated.json has no ${shot}.${label}; run video/scripts/beats.py`);
  return v;
};

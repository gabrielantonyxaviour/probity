import { z } from "zod";
import raw from "../../../docs/video/clips.json";

// REV-60: every recording slot lists the run it was filmed from. Grok validates narrated_events against traces.
export const ClipEntry = z.object({
  clip: z.string().regex(/^R\d{2}$/),
  run_id: z.string().nullable(),
  mode: z.enum(["live", "sample"]).nullable(),
  narrated_events: z.array(z.string()),
  trimmed_seconds: z.number().nonnegative().nullable().optional(),
  caption: z.string().nullable().optional(), // shown in the clip corner, e.g. "run shown at 4x"; wins over trimmed_seconds
});
export type ClipEntry = z.infer<typeof ClipEntry>;
export const clips: ClipEntry[] = z.array(ClipEntry).parse(raw);
export const clipFor = (id: string): ClipEntry | undefined => clips.find((c) => c.clip === id);

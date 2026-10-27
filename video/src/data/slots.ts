import { z } from "zod";
import raw from "../../../docs/video/slots.json";

export const SlotCfg = z.object({
  id: z.string().regex(/^R\d{2}$/),
  file: z.string().regex(/^[\w.-]+\.mp4$/),
  seconds: z.number().positive(),
  enabled: z.boolean(),
  title: z.string(),
  kind: z.string(),
  lower_third: z.string().nullable(),
});
export type SlotCfg = z.infer<typeof SlotCfg>;
export const SlotsFile = z.object({ fps: z.literal(30), cap_seconds: z.number(), slots: z.array(SlotCfg) });
export const slotsFile = SlotsFile.parse(raw);

import { z } from "zod";
import raw from "../../script.json";

export const Script = z.object({
  motion: z.array(z.object({ id: z.string().regex(/^M\d{2}$/), name: z.string(), seconds: z.number().positive() })),
  sequence: z.array(z.string().regex(/^[MR]\d{2}$/)),
  narration: z.array(
    z.object({ id: z.string(), audio: z.string().regex(/^a\d{2}\.m4a$/), label: z.string(), covers: z.array(z.string()), text: z.string() }),
  ),
});
export const script = Script.parse(raw);

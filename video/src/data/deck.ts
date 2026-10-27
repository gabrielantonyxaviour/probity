import { z } from "zod";
import raw from "../../deck.json";

export const Deck = z.object({
  slides: z.array(z.object({ id: z.string().regex(/^D\d{2}$/), seconds: z.number().positive(), title: z.string(), note: z.string() })).length(10),
  media: z.record(z.string(), z.array(z.object({ slot: z.string().regex(/^R\d{2}$/), at: z.number().nonnegative(), label: z.string() }))),
});
export const deck = Deck.parse(raw);

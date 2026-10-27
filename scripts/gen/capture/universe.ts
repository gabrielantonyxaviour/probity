// What to capture, read from data/covered_vendors.json and data/capture_queries.json (hand-written, zod-validated).
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO } from "../env-files";

const Detail = z.object({ uei: z.string().regex(/^[A-Z0-9]{12}$/), level: z.enum(["P", "C", "R"]) });
const Family = z.object({
  family: z.string(), details: z.array(Detail), children_of: z.array(z.string()), registrant_cik: z.string().regex(/^\d{10}$/),
  capture: z.boolean().optional(), name_query: z.string().optional(), note: z.string().optional(),
});
export const Covered = z.object({
  version: z.literal(1), families: z.array(Family),
  discovery: z.array(Detail.extend({ note: z.string().optional() })), judge_set: z.array(Family),
});
const Queries = z.object({ version: z.literal(1), keywords: z.array(z.string().min(3)), search_limit: z.number().int().default(8) });

export interface Universe { details: { uei: string; level: string }[]; children: string[]; ciks: string[]; keywords: string[]; limit: number }

export function loadUniverse(): Universe {
  const covered = Covered.parse(JSON.parse(readFileSync(path.join(REPO, "data/covered_vendors.json"), "utf8")));
  const queries = Queries.parse(JSON.parse(readFileSync(path.join(REPO, "data/capture_queries.json"), "utf8")));
  const judge = covered.judge_set.filter((f) => f.capture === true);
  const fams = [...covered.families, ...judge];
  const uniq = <T>(items: T[], key: (t: T) => string): T[] => [...new Map(items.map((i) => [key(i), i])).values()];
  return {
    details: uniq([...fams.flatMap((f) => f.details), ...covered.discovery], (d) => `${d.uei}-${d.level}`),
    children: [...new Set(fams.flatMap((f) => f.children_of))],
    ciks: [...new Set(fams.map((f) => f.registrant_cik))],
    keywords: queries.keywords,
    limit: queries.search_limit,
  };
}
export const ALL_FAMILY_CIKS = (): string[] => {
  const covered = Covered.parse(JSON.parse(readFileSync(path.join(REPO, "data/covered_vendors.json"), "utf8")));
  return [...covered.families, ...covered.judge_set].map((f) => f.registrant_cik);
};

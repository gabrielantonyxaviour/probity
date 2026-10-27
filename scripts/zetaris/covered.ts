// Covered slice (spine §8.7). data/covered_vendors.json wins when the data lane lands.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type Detail = { uei: string; level: "P" | "C" | "R" };
export type Family = { family: string; cik: string; details: Detail[]; children: string };

export const COVERED: Family[] = [
  { family: "Booz Allen", cik: "0001443646", children: "MBPHTU7Y9S65", details: [
    { uei: "MBPHTU7Y9S65", level: "P" }, { uei: "JCBMLGPE6Z71", level: "C" },
  ] },
  { family: "Leidos", cik: "0001336920", children: "ZL41ERXMPAR3", details: [
    { uei: "ZL41ERXMPAR3", level: "P" }, { uei: "MDSWM6MB1BH7", level: "C" }, { uei: "UE9QJD4KK1L6", level: "C" },
  ] },
  { family: "SAIC", cik: "0001571123", children: "RE7WMNV9L719", details: [
    { uei: "RE7WMNV9L719", level: "P" }, { uei: "MMLKPW9JLX64", level: "C" },
  ] },
  { family: "V2X", cik: "0001601548", children: "CG8SV4246V29", details: [{ uei: "CG8SV4246V29", level: "P" }] },
  { family: "L3Harris", cik: "0000202058", children: "SJULQDJ8NZU7", details: [
    { uei: "SJULQDJ8NZU7", level: "P" }, { uei: "QM4EZDV15JL8", level: "C" },
  ] },
  { family: "CACI", cik: "0000016058", children: "QSRTXLFKV857", details: [
    { uei: "QSRTXLFKV857", level: "P" }, { uei: "N3PBJAVNKF61", level: "C" },
  ] },
];

export const DISCOVERY_UEI = { uei: "KHK6E1JW9C15", level: "C" as const };

/** uuid(md5("UEI-"+uei)) + "-" + level. KHK6E1JW9C15 → 30b32b62-ffbf-d7e6-5b9d-95a295b95a6d-C. */
export function recipientId(uei: string, level: string): string {
  const hex = createHash("md5").update(`UEI-${uei}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}-${level}`;
}

type RawFamily = {
  family: string;
  details?: Detail[];
  children?: string;
  children_of?: string[];
  cik?: string;
  registrant_cik?: string;
};

/** The data-lane file uses `children_of` and `registrant_cik`. Judge families stay out of setup. */
export function loadCovered(): Family[] {
  try {
    const parsed = JSON.parse(readFileSync("data/covered_vendors.json", "utf8")) as { families?: RawFamily[] };
    if (Array.isArray(parsed.families) && parsed.families.length > 0) {
      return parsed.families.map((f) => ({
        family: f.family,
        cik: f.registrant_cik ?? f.cik ?? "",
        children: f.children ?? f.children_of?.[0] ?? "",
        details: f.details ?? [],
      }));
    }
  } catch {
    /* data lane has not landed the file */
  }
  return COVERED;
}

export function detailsOf(families: Family[]): Detail[] {
  return families.flatMap((f) => f.details);
}

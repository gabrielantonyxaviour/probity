// H-MEM note helpers (05 3.2, 3.5): the stored subject prefix, tag access and the deterministic activity gate.
import type { MemoryRecord } from "./hmem/index.ts";

const MARK = " address: ";

/** Stored content = subject prefix + text, so the hash-embedder retrieval sees the subject's tokens (SCR-05-6). */
export const subjectPrefix = (vendorId: string, legalName: string, uei: string | null, cik10: string | null): string =>
  `Vendor ${vendorId} (${legalName}), UEI ${uei ?? "none"}, CIK ${cik10 ?? "none"}, address:`;

export const tagValue = (m: MemoryRecord, key: string): string | null => {
  const t = m.tags.find((x) => x.startsWith(`${key}:`));
  return t ? t.slice(key.length + 1) : null;
};

/** The note text without the subject prefix (the UI shows this). Outcome summaries carry no prefix. */
export function textOf(m: MemoryRecord): string {
  const i = m.content.startsWith("Vendor ") ? m.content.indexOf(MARK) : -1;
  return i >= 0 ? m.content.slice(i + MARK.length) : m.content;
}

/** The tag gate of 05 3.5. With `v`, the note must also belong to that vendor (and its UEI when the note names one). */
export function isActive(m: MemoryRecord, v?: { vendor_id: string; uei: string | null }): boolean {
  if (v && !m.tags.includes(`vendor:${v.vendor_id}`)) return false;
  const noteUei = tagValue(m, "uei");
  if (v && noteUei && noteUei !== v.uei) return false;
  return (
    m.tags.includes("code:I1") &&
    m.tags.includes("kind:note") &&
    m.confidence >= 0.6 &&
    !m.supersededBy &&
    !m.tags.includes("review") &&
    !m.tags.some((t) => t.startsWith("conflict:"))
  );
}

export function noteResult(
  m: MemoryRecord,
  conflicts: Array<{ with: string; reason: string; confidence: number; resolution: "auto" | "queued" }>,
) {
  return { memory_id: m.id, confidence: m.confidence, layer: m.layer, tags: m.tags, conflicts };
}

// Session tables in SAMPLE_MODE. The live registrar issues CREATE REST SESSION TABLE; the sample registrar "creates" the table by
// loading the matching offline capture into a process-wide registry that the sample Zetaris port reads, so T11/T12/T14 see exactly
// the tables this process registered, in the same naming as live (pp_usa_r_<uei>, pp_usa_c_<uei>, pp_sec_s_<cik10>).
import type { Row, SampleData } from "./sample-store";
import { childRows, entityRow, registrantRow } from "./sample-tables";

export type SessionKind = "recipient" | "children" | "edgar";
export type SessionTable = { name: string; kind: SessionKind; key: string; rows: Row[] };

const registries = new Map<string, Map<string, SessionTable>>();
const of = (d: SampleData): Map<string, SessionTable> => {
  let m = registries.get(d.dir);
  if (!m) registries.set(d.dir, (m = new Map()));
  return m;
};

export const sessionName = (kind: SessionKind, key: string): string =>
  `pp_${kind === "recipient" ? "usa_r" : kind === "children" ? "usa_c" : "sec_s"}_${key.toLowerCase()}`;

export type Wanted = { kind: "recipient"; uei: string; level: string } | { kind: "children"; parent_uei: string } | { kind: "edgar"; cik10: string };

/** Registers (loads) the capture behind a session table. `created` is false when this process already had it. */
export function registerSession(d: SampleData, w: Wanted): { table: string; created: boolean } | null {
  const key = w.kind === "recipient" ? w.uei : w.kind === "children" ? w.parent_uei : w.cik10;
  const name = sessionName(w.kind, key);
  const reg = of(d);
  if (reg.has(name)) return { table: name, created: false };
  let rows: Row[] | null;
  if (w.kind === "recipient") {
    const r = d.recipients.get(`${w.uei}-${w.level}`);
    rows = r ? [entityRow(r, `session.${name}`)] : null;
  } else if (w.kind === "children") {
    const list = d.children.get(w.parent_uei);
    rows = list ? childRows(w.parent_uei, list, `session.${name}`) : null;
  } else {
    const e = d.registrants.get(w.cik10);
    rows = e ? [registrantRow(e, `session.${name}`)] : null;
  }
  if (!rows) return null;
  reg.set(name, { name, kind: w.kind, key, rows });
  return { table: name, created: true };
}

export const sessionTable = (d: SampleData, name: string): SessionTable | undefined => of(d).get(name.replace(/^session\./, ""));
export const recipientSessions = (d: SampleData): SessionTable[] => [...of(d).values()].filter((s) => s.kind === "recipient");
export const resetSampleSessions = (): void => registries.clear();

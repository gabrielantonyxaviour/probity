// Dispatch: template id -> sample implementation. A template without one is not answered (fail closed): the caller sees a typed
// `sample_data_missing` error, the run records the gap, and nothing is reported as a success.
import { ZodError } from "zod";
import { AppError } from "../../schemas/errors";
import * as d3 from "./sample-queries-d3";
import * as dq from "./sample-queries-dq";
import * as erp from "./sample-queries-erp";
import * as reg from "./sample-queries-registry";
import type { Row, SampleData } from "./sample-store";
import type { Usl } from "./sample-tables";

type Fn = (p: Record<string, unknown>, usl: Usl, d: SampleData) => Row[];
const TABLE: Record<string, Fn> = {
  T01: erp.t01, T02: erp.t02, T03: erp.t03, T04: erp.t04, T04b: erp.t04b, T07: erp.t07, T08: erp.t08, T08b: erp.t08b, T09: erp.t09,
  T05: reg.t05, T05b: reg.t05b, T06a: reg.t06a, T06b: reg.t06b, T06c: reg.t06c, T10: reg.t10, T11: reg.t11, T12: reg.t12, T14: reg.t14, T16: reg.t16,
  T20: dq.t20, T21: dq.t21,
  DQ7: d3.dq7, DQ7c: d3.dq7c, DQ9: d3.dq9, DQ9c: d3.dq9c, T23: d3.t23,
};

/** Ids that have a sample implementation (T11 to T16 session reads and T16 are extras the registry-scout paths need offline). */
export const SAMPLE_QUERY_IDS: readonly string[] = Object.keys(TABLE);

export function runSampleTemplate(id: string, params: Record<string, unknown>, usl: Usl, d: SampleData): Row[] {
  const fn = TABLE[id];
  if (!fn) throw new AppError("sample_data_missing", `No offline sample exists for template ${id}.`);
  try {
    const { template_id: _t, ...rest } = params;
    return fn(rest, usl, d);
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof ZodError) throw new AppError("zetaris_bad_request", "The query parameters were not valid.");
    throw new AppError("internal_error", "The offline sample query failed.");
  }
}

// Public template allow-list (03 §7.2).
import type { TemplateId } from "../schemas/templates.ts";
import { t12, t13, t14, t15, t22, t30 } from "./ddl.ts";
import { dq7, dq7c, dq9, dq9c, t23 } from "./d3.ts";
import { t20, t21 } from "./dq.ts";
import { t01, t02, t03, t04, t04b, t07, t08, t08b, t09 } from "./erp.ts";
import { t05, t05b, t06a, t06b, t06c, t10, t11, t16 } from "./registry.ts";
import type { Template } from "./types.ts";

export type { ObservationRule, Row, SampleStore, Template } from "./types.ts";
export { rowHash } from "../adapters/zetaris/response.ts";
export { registerSession } from "../adapters/zetaris/registrar.ts";
export { lit } from "./lit.ts";
export { nameNorm, nameNormSql } from "./name-norm.ts";
export { DQ_RULES } from "./dq-rules.ts";
export { selectFallback } from "./dq.ts";

export const templates: Record<TemplateId, Template<never>> = {
  T01: t01 as unknown as Template<never>,
  T02: t02 as unknown as Template<never>,
  T03: t03 as unknown as Template<never>,
  T04: t04 as unknown as Template<never>,
  T04b: t04b as unknown as Template<never>,
  T05: t05 as unknown as Template<never>,
  T05b: t05b as unknown as Template<never>,
  T06a: t06a as unknown as Template<never>,
  T06b: t06b as unknown as Template<never>,
  T06c: t06c as unknown as Template<never>,
  T07: t07 as unknown as Template<never>,
  T08: t08 as unknown as Template<never>,
  T08b: t08b as unknown as Template<never>,
  T09: t09 as unknown as Template<never>,
  T10: t10 as unknown as Template<never>,
  T11: t11 as unknown as Template<never>,
  T12: t12 as unknown as Template<never>,
  T13: t13 as unknown as Template<never>,
  T14: t14 as unknown as Template<never>,
  T15: t15 as unknown as Template<never>,
  T16: t16 as unknown as Template<never>,
  T20: t20 as unknown as Template<never>,
  T21: t21 as unknown as Template<never>,
  T22: t22 as unknown as Template<never>,
  T30: t30 as unknown as Template<never>,
  DQ7: dq7 as unknown as Template<never>,
  DQ7c: dq7c as unknown as Template<never>,
  DQ9: dq9 as unknown as Template<never>,
  DQ9c: dq9c as unknown as Template<never>,
  T23: t23 as unknown as Template<never>,
};

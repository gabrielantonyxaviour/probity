// NAME_NORM (03 §3) plus the fictional-marker strip (spine §9.4, REV-65).

/** Innermost step is replace(upper(trim(x)), ' (FICTIONAL)', ''). TS maps tabs and newlines to spaces first. */
export function nameNorm(raw: string): string {
  let s = raw.replace(/[\t\r\n]/g, " ").toUpperCase().trim().replaceAll(" (FICTIONAL)", "");
  s = s.replace(/[.,'"()]/g, "");
  s = s.replace(/ +/g, " ").trim();
  s = s.replace(/ ?\/[A-Z]{2}\/$/, "");
  s = s.replace(/(^| )INCORPORATED( |$)/g, "$1INC$2");
  s = s.replace(/(^| )CORPORATION( |$)/g, "$1CORP$2");
  s = s.replace(/(^| )COMPANY( |$)/g, "$1CO$2");
  s = s.replace(/(^| )LIMITED( |$)/g, "$1LTD$2");
  return s.trim();
}

/** Spark SQL expression. `expr` is a SQL expression, not a literal. */
export function nameNormSql(expr: string): string {
  const inner = `replace(upper(trim(${expr})), ' (FICTIONAL)', '')`;
  const cls = "'[.,''\"()]'";
  return (
    "trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(" +
    `regexp_replace(${inner}, ${cls}, ''), ` +
    `' +', ' '), ` +
    `' ?/[A-Z]{2}/$', ''), ` +
    `'(^| )INCORPORATED( |$)', '$1INC$2'), ` +
    `'(^| )CORPORATION( |$)', '$1CORP$2'), ` +
    `'(^| )COMPANY( |$)', '$1CO$2'), ` +
    `'(^| )LIMITED( |$)', '$1LTD$2'))`
  );
}

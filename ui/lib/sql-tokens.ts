// Tiny SQL tokenizer for the evidence drawer. Green and red mean decisions, so code uses the dedicated code tokens only.
const KEYWORDS = new Set(
  "SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ON AND OR NOT AS IN IS NULL ORDER BY GROUP LIMIT CREATE REST SESSION TABLE REQUEST HEADER BODY LATERAL VIEW EXPLODE RUN DQ REGISTER ACTIVATE USL COMPILE DISTINCT COUNT UPPER LOWER LIKE WITH UNION ALL ASC DESC CASE WHEN THEN ELSE END".split(" "),
);
export type SqlToken = { t: "k" | "s" | "n" | "p" | "c" | "x"; v: string };

export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  const re = /(--[^\n]*)|('(?:[^']|'')*'|"(?:[^"\\]|\\.)*")|(:[A-Za-z_][A-Za-z0-9_]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_'":-]+|[-:])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    if (m[1]) out.push({ t: "c", v: m[1] });
    else if (m[2]) out.push({ t: "s", v: m[2] });
    else if (m[3]) out.push({ t: "p", v: m[3] });
    else if (m[4]) out.push({ t: "n", v: m[4] });
    else if (m[5]) out.push({ t: KEYWORDS.has(m[5].toUpperCase()) ? "k" : "x", v: m[5] });
    else out.push({ t: "x", v: m[0] });
  }
  return out;
}

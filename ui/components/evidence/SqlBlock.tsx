"use client";
import { useMemo } from "react";
import { tokenizeSql } from "@/lib/sql-tokens";
import { EVIDENCE } from "@/lib/copy";

export function SqlBlock({ sql }: { sql: string }) {
  const toks = useMemo(() => tokenizeSql(sql), [sql]);
  return (
    <div className="sql" data-testid="evidence-sql">
      <pre aria-label={EVIDENCE.sqlLabel} tabIndex={0}>
        {toks.map((t, i) => (t.t === "x" ? t.v : <span key={i} className={t.t}>{t.v}</span>))}
      </pre>
      <span className="sql__fade" aria-hidden />
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { apiGet } from "@/lib/api";
import { RunListResponse } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Popover } from "@/components/ui/overlay";
import { DECISION_UI, STATUS_CHIPS } from "@/lib/labels";
import { REVIEW } from "@/lib/copy";
import { stamp } from "@/lib/format";
import type { z } from "zod";

type Item = z.infer<typeof RunListResponse>["runs"][number];

export function useRunHistory(requestId: string | null, runId: string, status: string): Item[] {
  const [runs, setRuns] = useState<Item[]>([]);
  useEffect(() => {
    if (!requestId) return;
    let alive = true;
    apiGet("/runs?limit=100", RunListResponse)
      .then((r) => alive && setRuns(r.runs.filter((x) => x.request_id === requestId).sort((a, b) => b.started_at.localeCompare(a.started_at))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [requestId, runId, status]);
  return runs;
}

const labelOf = (r: Item) => (r.decision ? DECISION_UI[r.decision].word : r.status === "running" ? "Checking…" : r.status === "error" ? STATUS_CHIPS.error.word : STATUS_CHIPS.none.word);

/** "Previous check: {label}" (the check before this one) and the list of every check of this request. */
export function previousLabel(runs: Item[], runId: string): string | null {
  const i = runs.findIndex((r) => r.run_id === runId);
  const prev = i >= 0 ? runs[i + 1] : undefined;
  return prev ? labelOf(prev) : null;
}

export function RunHistory({ runs, runId }: { runs: Item[]; runId: string }) {
  if (runs.length < 2) return null;
  return (
    <Popover
      label={REVIEW.history}
      align="start"
      trigger={<Button variant="ghost" icon={<History />} data-testid="run-history">{`${runs.length} checks`}</Button>}
    >
      <div className="grid gap-2" data-testid="run-history-list">
        <span className="t-eyebrow">{REVIEW.history}</span>
        <ul className="grid">
          {runs.map((r) => (
            <li key={r.run_id} className="flex items-center justify-between gap-3 py-2 border-t border-rule first:border-t-0">
              <Chip tone={r.decision ? DECISION_UI[r.decision].tone : "neutral"} glyph={r.decision ? DECISION_UI[r.decision].glyph : "○"}>{labelOf(r)}</Chip>
              {r.run_id === runId ? <span className="t-mono-label text-fg-muted">{REVIEW.historyNow}</span> : <Link className="t-mono-label p-link" href={`/app/review/${r.run_id}`}>{stamp(r.started_at)}</Link>}
            </li>
          ))}
        </ul>
      </div>
    </Popover>
  );
}

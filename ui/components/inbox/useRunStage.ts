"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { RunDetail } from "@/lib/contracts";
import { STAGE_TO_STEP, STEPS } from "@/lib/labels-trace";

/** Current step label for a running row, polled every 3 s from GET /runs/:id (stage is authoritative). */
export function useRunStep(runId: string | null | undefined, running: boolean): string | null {
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => {
    if (!runId || !running) return;
    let alive = true;
    const pull = async () => {
      try {
        const d = await apiGet(`/runs/${encodeURIComponent(runId)}`, RunDetail);
        const i = STAGE_TO_STEP[d.stage];
        if (alive && i != null) setStep(STEPS[i]);
      } catch {
        /* the row keeps its last step; the list refetch reports real failures */
      }
    };
    void pull();
    const t = setInterval(pull, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [runId, running]);
  return step;
}

"use client";
import { useState } from "react";
import { z } from "zod";
import type { GateDecision } from "@/lib/contracts";
import { FeedbackResponse } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { apiPost, errorMessage } from "@/lib/api";
import { DECISION, DIALOGS } from "@/lib/copy";
import { useReview } from "./review-context";

type Memory = GateDecision["memory_recalled"][number];
const KINDS = [
  ["helpful", DECISION.helpful],
  ["not_helpful", DECISION.notHelpful],
  ["wrong", DECISION.wrong],
] as const;

function Feedback({ m }: { m: Memory }) {
  const [done, setDone] = useState<string | null>(null);
  async function send(kind: (typeof KINDS)[number][0]) {
    try {
      await apiPost(`/notes/${encodeURIComponent(m.memory_id)}/feedback`, { kind, by: DIALOGS.callback.calledByDefault }, FeedbackResponse as z.ZodType);
      setDone(kind);
    } catch (e) {
      notify(errorMessage(e), "conflict");
    }
  }
  return (
    <span className="inline-flex flex-wrap gap-2">
      {KINDS.map(([k, label]) => (
        <Button key={k} variant="ghost" disabled={!!done} onClick={() => void send(k)} data-testid={`feedback-${k}`}>
          {done === k && k === "helpful" ? DECISION.markedHelpful : label}
        </Button>
      ))}
    </span>
  );
}

/** One chip per memory_recalled[]: World Model facts as the red Remembered chip, H-MEM notes as the info chip (01 section 7.1.2). */
export function MemoryChips({ decision }: { decision: GateDecision }) {
  const { openMemory, hmem } = useReview();
  if (decision.memory_recalled.length === 0) return null;
  return (
    <div className="dec-chips" data-testid="memory-chips">
      {decision.memory_recalled.map((m) =>
        m.engine === "world_model" ? (
          <button key={m.memory_id} type="button" onClick={() => openMemory(m.memory_id)} className="inline-flex" data-testid="memory-chip" data-engine="world_model">
            <Chip tone="conflict" glyph="✕" wrap>{DECISION.remembered}: Used in a request later confirmed as an impersonation (session {m.session_id}).</Chip>
          </button>
        ) : (
          <span key={m.memory_id} className="inline-flex flex-wrap items-center gap-2" data-testid="memory-chip" data-engine="hmem">
            <button type="button" onClick={() => openMemory(m.memory_id)} className="inline-flex">
              <Chip tone="info" glyph="i" wrap>Remembered note from session {m.session_id}: {m.text}</Chip>
            </button>
            <span className="t-ui-xs text-fg-muted">Effect: {m.effect}</span>
            {hmem ? <Feedback m={m} /> : null}
          </span>
        ),
      )}
    </div>
  );
}

"use client";
import { CallbackDialog } from "@/components/dialogs/CallbackDialog";
import { NoteDialog } from "@/components/dialogs/NoteDialog";
import { OutcomeDialog } from "@/components/dialogs/OutcomeDialog";
import { EvidenceDrawer } from "@/components/evidence/EvidenceDrawer";
import { MemoryDrawer } from "@/components/evidence/MemoryDrawer";
import { Sheet } from "@/components/ui/overlay";
import { LETTER } from "@/lib/copy";
import { LetterBody } from "./LetterPane";
import { useReview } from "./review-context";

/** URL-driven overlays: evidence, memory, call-back, outcome, note, and the full letter (?letter=full). */
export function Overlays() {
  const r = useReview();
  return (
    <>
      <EvidenceDrawer />
      <MemoryDrawer />
      <CallbackDialog />
      <OutcomeDialog />
      <NoteDialog />
      <Sheet open={r.param("letter") === "full"} onOpenChange={(o) => !o && r.setParams({ letter: null })} eyebrow={LETTER.heading} title={LETTER.heading} side="left" testId="letter-full" closeLabel={LETTER.close}>
        <div className="p-sheet__cell"><LetterBody zoomable={false} wideImage split /></div>
      </Sheet>
    </>
  );
}

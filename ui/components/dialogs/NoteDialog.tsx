"use client";
import { useState } from "react";
import { NoteResponse } from "@/lib/contracts";
import { apiPost, errorMessage } from "@/lib/api";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { notify } from "@/components/ui/toast";
import { DIALOGS, TOASTS } from "@/lib/copy";
import { useReview } from "@/components/review/review-context";

/** Add analyst note ?note=1, only when features.hmem (01 section 7.5). Tags are derived server-side. */
export function NoteDialog() {
  const r = useReview();
  const open = r.param("note") === "1" && r.hmem;
  const [text, setText] = useState("");
  const [i1, setI1] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const vendor = r.decision?.resolved.vendor_id ?? null;
  const close = () => { r.setParams({ note: null }); setText(""); setErr(null); };
  async function save() {
    if (!vendor || text.trim().length < 10) return setErr("Write at least 10 characters.");
    setBusy(true);
    try {
      await apiPost("/notes", { vendor_id: vendor, text: text.trim(), author: DIALOGS.callback.calledByDefault, codes: i1 ? ["I1"] : [], request_id: r.decision?.request_id, run_id: r.runId }, NoteResponse);
      notify(TOASTS.noteSaved, "agree");
      close();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={DIALOGS.note.title} testId="note-form" closeLabel={DIALOGS.close}
      footer={<><Button variant="ghost" onClick={close}>{DIALOGS.callback.cancel}</Button><Button variant="accent" busy={busy} busyLabel={DIALOGS.callback.saving} onClick={() => void save()}>{DIALOGS.note.save}</Button></>}>
      <Field label={DIALOGS.note.label(r.decision?.resolved.vendor_name ?? "this vendor")}>{(f) => <Textarea id={f.id} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={DIALOGS.note.placeholder} />}</Field>
      <label className="flex items-center gap-3 t-ui-sm"><input type="checkbox" checked={i1} onChange={(e) => setI1(e.target.checked)} /> {DIALOGS.note.appliesTo}: {DIALOGS.note.i1}</label>
      {err ? <Alert tone="conflict" role="alert">{err}</Alert> : null}
    </Dialog>
  );
}

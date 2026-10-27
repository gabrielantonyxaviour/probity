"use client";
import { useState } from "react";
import { OutcomeResponse } from "@/lib/contracts";
import { apiPost, errorMessage } from "@/lib/api";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { RadioTiles } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { notify } from "@/components/ui/toast";
import { DIALOGS, TOASTS } from "@/lib/copy";
import { useReview } from "@/components/review/review-context";

type Out = "fraud_confirmed" | "legitimate";

/** Record final outcome ?outcome=1 -> POST /outcomes (01 section 7.5). "Confirmed impersonation" uses the danger pill. */
export function OutcomeDialog() {
  const r = useReview();
  const open = r.param("outcome") === "1";
  const [v, setV] = useState<Out | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => { r.setParams({ outcome: null }); setV(""); setErr(null); };
  async function save() {
    if (!v || !r.decision) return setErr(DIALOGS.callback.required);
    setBusy(true);
    try {
      await apiPost("/outcomes", { request_id: r.decision.request_id, outcome: v, by: DIALOGS.callback.calledByDefault }, OutcomeResponse);
      notify(v === "fraud_confirmed" ? TOASTS.outcomeImpersonation : TOASTS.outcomeLegit, "agree");
      close();
      r.refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={DIALOGS.outcome.title} testId="outcome-dialog" closeLabel={DIALOGS.close}
      footer={<><Button variant="ghost" onClick={close}>{DIALOGS.callback.cancel}</Button><Button variant={v === "fraud_confirmed" ? "danger" : "accent"} busy={busy} busyLabel={DIALOGS.callback.saving} onClick={() => void save()} data-testid="outcome-save">{DIALOGS.outcome.record}</Button></>}>
      <RadioTiles<Out> label={DIALOGS.outcome.title} value={v} onChange={(x) => { setV(x); setErr(null); }} options={[
        { id: "fraud_confirmed", label: DIALOGS.outcome.impersonation, help: DIALOGS.outcome.impersonationHelp, testId: "outcome-impersonation" },
        { id: "legitimate", label: DIALOGS.outcome.legit, testId: "outcome-legitimate" },
      ]} />
      {err ? <Alert tone="conflict" role="alert">{err}</Alert> : null}
    </Dialog>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CallbackResponse } from "@/lib/contracts";
import { apiPost, ApiClientError, errorMessage } from "@/lib/api";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, RadioTiles } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { notify } from "@/components/ui/toast";
import { DIALOGS, TOASTS } from "@/lib/copy";
import { isoText, localInput, stamp } from "@/lib/format";
import { useRequests } from "@/lib/requests-store";
import { useReview } from "@/components/review/review-context";

type Outcome = "confirmed" | "denied" | "no_answer";

/** Log call-back outcome ?log={i}: only scripted numbers, no phone input (B4). One POST; the server re-runs (01 section 7.4). */
export function CallbackDialog() {
  const r = useReview();
  const router = useRouter();
  const { items } = useRequests();
  const idx = r.param("log");
  const script = idx != null && r.decision ? r.decision.callback_scripts[Number(idx)] ?? null : null;
  const open = idx != null && !!script;
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [by, setBy] = useState<string>(DIALOGS.callback.calledByDefault);
  const [at, setAt] = useState(localInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: "at" | "outcome"; msg: string } | null>(null);
  useEffect(() => {
    if (open) {
      setOutcome("");
      setErr(null);
      setBy(DIALOGS.callback.calledByDefault);
      setAt(localInput(new Date()));
    }
  }, [open, idx]);
  const requestId = r.decision?.request_id ?? null;
  const received = items?.find((i) => i.request_id === requestId)?.received_at ?? null;
  const close = () => r.setParams({ log: null });

  async function submit() {
    if (!script || !r.decision || !requestId) return;
    if (!outcome) return setErr({ field: "outcome", msg: DIALOGS.callback.required });
    const calledAt = new Date(`${at}:00Z`);
    if (received && calledAt.getTime() <= Date.parse(received)) return setErr({ field: "at", msg: DIALOGS.callback.calledAtRule(stamp(received)) });
    const vendor = script.for_vendor_id ?? r.decision.resolved.vendor_id;
    if (!vendor) return setErr({ msg: "No vendor is attached to this script." });
    setBusy(true);
    setErr(null);
    try {
      const res = await apiPost("/callbacks", { request_id: requestId, vendor_id: vendor, phone_e164: script.number_e164, phone_source: script.number_source, outcome, called_by: by, called_at: calledAt.toISOString(), reevaluate: outcome !== "no_answer" }, CallbackResponse);
      close();
      if (res.rerun) {
        notify(TOASTS.callbackSaved(requestId), "info");
        router.push(`/app/review/${res.rerun.run_id}`);
      } else notify(outcome === "no_answer" ? TOASTS.callbackNoAnswer : TOASTS.callbackSaved(requestId), "info");
    } catch (e) {
      const m = errorMessage(e);
      if (e instanceof ApiClientError && e.code === "invalid_input" && /called_at/.test(m)) setErr({ field: "at", msg: DIALOGS.callback.calledAtRule(received ? stamp(received) : "earlier") });
      else setErr({ msg: TOASTS.callbackFailed(m) });
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={DIALOGS.callback.title}
      testId="callback-log-form"
      closeLabel={DIALOGS.close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{DIALOGS.callback.cancel}</Button>
          <Button variant="accent" busy={busy} busyLabel={DIALOGS.callback.saving} onClick={() => void submit()} data-testid="callback-save">{outcome === "no_answer" ? DIALOGS.callback.save : DIALOGS.callback.saveRecheck}</Button>
        </>
      }
    >
      {script ? (
        <>
          <div>
            <span className="p-label t-eyebrow">{DIALOGS.callback.number}</span>
            <div className="p-field-ro"><span className="t-mono-data" style={{ fontSize: 20 }}>{script.number_display}</span></div>
            <p className="p-help t-ui-xs">{isoText(script.source_label)}</p>
          </div>
          <div>
            <span className="p-label t-eyebrow">{DIALOGS.callback.outcome}</span>
            <RadioTiles<Outcome> label={DIALOGS.callback.outcome} value={outcome} onChange={(v) => { setOutcome(v); setErr(null); }} options={[
              { id: "confirmed", label: DIALOGS.callback.confirmed, testId: "outcome-confirmed" },
              { id: "denied", label: DIALOGS.callback.denied, testId: "outcome-denied" },
              { id: "no_answer", label: DIALOGS.callback.noAnswer, testId: "outcome-no-answer" },
            ]} />
            {err?.field === "outcome" ? <p className="p-err t-ui-xs"><span aria-hidden>✕</span>{err.msg}</p> : null}
          </div>
          {outcome === "denied" ? <Alert tone="gap" naked>{DIALOGS.callback.deniedHelp}</Alert> : null}
          <Field label={DIALOGS.callback.calledBy}>{(f) => <Input id={f.id} value={by} onChange={(e) => setBy(e.target.value)} maxLength={80} />}</Field>
          <Field label={DIALOGS.callback.calledAt} error={err?.field === "at" ? err.msg : null}>{(f) => <Input id={f.id} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
          {err && !err.field ? <Alert tone="conflict" role="alert">{err.msg}</Alert> : null}
        </>
      ) : null}
    </Dialog>
  );
}

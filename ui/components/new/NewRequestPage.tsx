"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/chip";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, TwoTone } from "@/components/ui/misc";
import { PillTabs } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/field";
import { useReady } from "@/components/shell/ReadyProvider";
import { apiGet, apiUpload, ApiClientError, errorMessage } from "@/lib/api";
import { PaymentRunsResponse, UploadResponse } from "@/lib/contracts";
import { NEW } from "@/lib/copy";
import { loadExamples, postRun } from "@/lib/start-run";
import { useRequests } from "@/lib/requests-store";
import { notify } from "@/components/ui/toast";
import { TOASTS } from "@/lib/copy";
import { initialUpload, UploadTab, type PaymentRun, type UploadState } from "./UploadTab";
import { TypedTab } from "./TypedTab";
import { checkEml, checkLetter, emptyTyped, fieldFromApiError, typedInput, validateTyped, type Errors, type TypedForm } from "./validation";
import { ExamplesPanel } from "./ExamplesPanel";

type Tab = "upload" | "typed";

/** /app/new (01 section 7.2): upload a letter (+ .eml) or type details; both end in POST /run (async) and a route to the review. */
export function NewRequestPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { ready } = useReady();
  const { items } = useRequests();
  const [tab, setTab] = useState<Tab>(sp.get("tab") === "typed" || sp.get("from") ? "typed" : "upload");
  const [up, setUp] = useState<UploadState>(initialUpload);
  const [typed, setTyped] = useState<TypedForm>(emptyTyped);
  const [errors, setErrors] = useState<Errors>({});
  const [runs, setRuns] = useState<PaymentRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [outage, setOutage] = useState(false);
  const [tries, setTries] = useState<string[]>([]);
  useEffect(() => {
    apiGet("/payment-runs", PaymentRunsResponse as z.ZodType<z.infer<typeof PaymentRunsResponse>>).then((r) => setRuns(r.runs)).catch(() => undefined);
    loadExamples().then((ex) => setTries(ex.filter((e) => e.kind === "typed").map((e) => (e.request.input as { vendor?: { legal_name?: string } }).vendor?.legal_name ?? "").filter(Boolean))).catch(() => undefined);
  }, []);
  const from = sp.get("from");
  useEffect(() => {
    const name = items?.find((i) => i.request_id === from)?.claimed_name;
    if (name) setTyped((t) => (t.name ? t : { ...t, name }));
  }, [from, items]);
  const features = ready?.features;

  async function submit() {
    setBanner(null);
    const options = outage ? { simulate_outage: ["usaspending"] } : {};
    if (tab === "upload") {
      const e: Errors = {};
      const le = checkLetter(up.letter);
      if (le) e.letter = le;
      const ee = await checkEml(up.eml);
      if (ee) e.eml = ee;
      setErrors(e);
      if (Object.keys(e).length) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append("letter", up.letter!);
        if (up.eml) form.append("headers", up.eml);
        const u = await apiUpload("/uploads", form, UploadResponse);
        const input = { upload_id: u.upload_id, ...(up.runId && { payment_run_id: up.runId }), received_at: new Date(`${up.receivedAt}:00Z`).toISOString() };
        const acc = await postRun(input, options);
        notify(TOASTS.started(acc.run_id), "info");
        router.push(`/app/review/${acc.run_id}`);
      } catch (err) {
        fail(err);
      }
      return;
    }
    const e = validateTyped(typed);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const acc = await postRun(typedInput(typed, up.runId || undefined), options);
      router.push(`/app/review/${acc.run_id}`);
    } catch (err) {
      fail(err);
    }
  }
  function fail(err: unknown) {
    setBusy(false);
    const msg = errorMessage(err);
    if (err instanceof ApiClientError && err.code === "payload_too_large") return setErrors({ letter: NEW.v.tooBig });
    if (err instanceof ApiClientError && err.code === "unsupported_media_type") return setErrors({ letter: NEW.v.wrongType });
    if (/pdf/i.test(msg) && /page/i.test(msg)) return setErrors({ letter: NEW.v.pdfPages });
    const f = fieldFromApiError(msg);
    if (f) setErrors({ [f]: msg.replace(/^input\.[^:]+:\s*/, "") });
    else setBanner(NEW_START(msg));
  }
  const count = Object.keys(errors).length;
  const tabs = useMemo(() => [{ id: "upload" as const, label: NEW.tabs.upload }, { id: "typed" as const, label: NEW.tabs.typed }], []);

  return (
    <div>
      <div className="page-head">
        <div className="grid gap-4"><Badge>{NEW.crumb}</Badge><h1 className="t-app-title text-fg">{NEW.title}</h1><p className="t-ui measure-body"><TwoTone fact={NEW.sub} /></p></div>
      </div>
      <div className="nw">
        <form className="nw__form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-busy={busy} data-testid="new-form">
          <PillTabs label="Input type" items={tabs} value={tab} onChange={(t) => { setTab(t); setErrors({}); }} />
          {count > 0 ? <Alert tone="conflict" role="alert" testId="error-summary"><span tabIndex={-1}>{NEW.errorSummary}</span></Alert> : null}
          {banner ? <Alert tone="conflict" role="alert" testId="error-banner">{banner}</Alert> : null}
          {tab === "upload" ? <UploadTab s={up} set={(u) => setUp((s) => ({ ...s, ...u }))} errors={errors} runs={runs} /> : <TypedTab f={typed} set={(u) => setTyped((s) => ({ ...s, ...u }))} errors={errors} tries={tries} onTry={(name) => setTyped((s) => ({ ...s, name }))} />}
          <Alert tone="info" testId="demo-notice">{NEW.demoNotice}</Alert>
          {features?.simulate_outage ? (
            <details><summary className="t-mono-ui text-fg-2 cursor-pointer">{NEW.advanced}</summary>
              <label className="flex items-center gap-3 mt-3 t-ui-sm"><Switch checked={outage} onCheckedChange={setOutage} label={NEW.outageLabel} />{NEW.outageLabel}</label>
              <p className="p-help t-ui-xs">{NEW.outageHelp}</p></details>
          ) : null}
          <div className="flex gap-3">
            <Button type="submit" variant="accent" busy={busy} busyLabel={NEW.starting} data-testid="verify-button">{NEW.verify}</Button>
            <LinkButton href="/app" variant="ghost">{NEW.cancel}</LinkButton>
          </div>
        </form>
        <aside className="nw__help"><ExamplesPanel onTyped={(name) => { setTab("typed"); setTyped((s) => ({ ...s, name })); }} /></aside>
      </div>
    </div>
  );
}

const NEW_START = (m: string) => `Couldn't start the check: ${m}`;

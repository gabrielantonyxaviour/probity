"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/field";
import { NEW } from "@/lib/copy";
import { localInput, runDate } from "@/lib/format";
import type { Errors } from "./validation";

export type PaymentRun = { payment_run_id: string; scheduled_date: string; item_count: number };
export type UploadState = { letter: File | null; eml: File | null; runId: string; receivedAt: string };
export const initialUpload = (): UploadState => ({ letter: null, eml: null, runId: "", receivedAt: localInput(new Date()) });

function Drop({ file, onFile, error, accept, testId, label, help, text }: { text: string; file: File | null; onFile: (f: File | null) => void; error?: string; accept: string; testId: string; label: string; help?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="p-label t-eyebrow">{label}</span>
      <div className="drop" data-over={over || undefined} data-invalid={!!error || undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0] ?? null); }}>
        <p className="t-ui text-fg-2">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : text}</p>
        <Button onClick={() => input.current?.click()}>{NEW.choose}</Button>
        <input ref={input} type="file" accept={accept} hidden data-testid={testId} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>
      {error ? <p className="p-err t-ui-xs" role="alert"><span aria-hidden>✕</span>{error}</p> : help ? <p className="p-help t-ui-xs">{help}</p> : null}
    </div>
  );
}

export function UploadTab({ s, set, errors, runs }: { s: UploadState; set: (u: Partial<UploadState>) => void; errors: Errors; runs: PaymentRun[] }) {
  return (
    <div className="grid gap-5">
      <Drop text={NEW.dropText} file={s.letter} onFile={(f) => set({ letter: f })} error={errors.letter} accept=".png,.pdf,image/png,application/pdf" testId="upload-letter" label={NEW.letterLabel} />
      <Drop text={NEW.dropTextEml} file={s.eml} onFile={(f) => set({ eml: f })} error={errors.eml} accept=".eml,.txt,message/rfc822,text/plain" testId="upload-eml" label={NEW.emlLabel} help={NEW.emlHelp} />
      <div className="grid-2">
        <Field label={NEW.paymentRun}>
          {(f) => (
            <select id={f.id} className="p-field" value={s.runId} onChange={(e) => set({ runId: e.target.value })} data-testid="payment-run-select">
              <option value="">{NEW.paymentRunAuto}</option>
              {runs.map((r) => <option key={r.payment_run_id} value={r.payment_run_id}>{`${r.payment_run_id} · ${runDate(r.scheduled_date)} · ${r.item_count} items`}</option>)}
            </select>
          )}
        </Field>
        <Field label={NEW.receivedAt}>{(f) => <Input id={f.id} type="datetime-local" value={s.receivedAt} onChange={(e) => set({ receivedAt: e.target.value })} />}</Field>
      </div>
    </div>
  );
}

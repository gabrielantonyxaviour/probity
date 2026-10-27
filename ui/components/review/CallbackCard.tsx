"use client";
import { Check } from "lucide-react";
import type { GateDecision } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { CopyIconButton, copyText } from "@/components/ui/copy-button";
import { notify } from "@/components/ui/toast";
import { Alert } from "@/components/ui/misc";
import { SCRIPT, TOASTS } from "@/lib/copy";
import { isoText } from "@/lib/format";
import { useReview } from "./review-context";

type Script = GateDecision["callback_scripts"][number];

export function scriptText(s: Script): string {
  return [`${s.number_display} · ${isoText(s.source_label)}`, ...s.lines.map((l, i) => `${String(i + 1).padStart(2, "0")} ${isoText(l)}`)].join("\n");
}

function Card({ s, many, index }: { s: Script; many: boolean; index: number }) {
  const { setParams } = useReview();
  const head = many ? SCRIPT.forVendor(s.vendor_name ?? "this vendor", s.for_vendor_id) : SCRIPT.one;
  return (
    <div className="cb__panel" data-testid="callback-script" data-vendor={s.for_vendor_id ?? ""}>
      <div className="cb__head t-mono-panel">
        <span>{`// ${head}`}</span>
        <CopyIconButton text={scriptText(s)} label="Copy script" toast={TOASTS.scriptCopied} />
      </div>
      <div className="cb__body">
        <div>
          <p className="cb__label t-mono-label">{isoText(s.source_label)}</p>
          <p className="cb__num font-mono" data-testid="callback-number">
            <span>{s.number_display}</span>
            <span className="cb__ok" aria-hidden><Check size={14} /></span>
          </p>
        </div>
        {s.do_not_use.length > 0 ? (
          <div className="cb__dnu" data-testid="do-not-use">
            <span className="t-eyebrow">{SCRIPT.doNotUse}</span>
            {s.do_not_use.map((d) => (
              <p key={d.number_display + d.reason} className="cb__dnu-row">
                <span className="t-mono-data text-fg-muted p-struck">{d.number_display}</span>
                <span className="t-ui-sm text-fg-muted">{d.reason}</span>
              </p>
            ))}
          </div>
        ) : null}
        <ol className="cb__lines">{s.lines.map((l, i) => <li key={i} className="t-ui-sm text-fg">{isoText(l)}</li>)}</ol>
        <div className="cb__actions">
          <Button variant="accent" onClick={async () => notify((await copyText(scriptText(s))) ? TOASTS.scriptCopied : "Couldn't copy", "agree")} data-testid="copy-script">{SCRIPT.copy}</Button>
          <Button onClick={() => setParams({ log: String(index) }, "push")} data-testid="log-callback">{SCRIPT.log}</Button>
        </div>
      </div>
    </div>
  );
}

/** "Do this now": one call-back card per script; two for an ambiguous identity (01 section 7.1.2a). */
export function CallbackCards({ decision }: { decision: GateDecision }) {
  const scripts = decision.callback_scripts;
  if (scripts.length === 0) {
    if (decision.decision === "APPROVE") return null;
    return <Alert tone="gap" testId="callback-none">{SCRIPT.none}</Alert>;
  }
  return (
    <div className="cb">
      {scripts.length > 1 ? <p className="t-ui-sm text-fg-2">{SCRIPT.many}</p> : null}
      {scripts.map((s, i) => <Card key={`${s.number_e164}${i}`} s={s} many={scripts.length > 1} index={i} />)}
    </div>
  );
}

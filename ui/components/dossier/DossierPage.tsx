"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRun } from "@/lib/use-run";
import { ReviewProvider, useReview } from "@/components/review/review-context";
import { Badge } from "@/components/ui/chip";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, TwoTone } from "@/components/ui/misc";
import { notify } from "@/components/ui/toast";
import { copyText } from "@/components/ui/copy-button";
import { scriptText } from "@/components/review/CallbackCard";
import { DOSSIER, ERRORS, FIXED, TOASTS } from "@/lib/copy";
import { downloadText, prettyJson } from "@/lib/download";
import { stamp } from "@/lib/format";
import { useRequests } from "@/lib/requests-store";
import { ConflictsSection, DecisionSection, EditsSection, EvidenceSection, MoneySection, NoticeAlert, ReasonsSection, RememberedSection, ScriptSection, SweepSection, TailSections } from "./DossierSections";

function Body() {
  const r = useReview();
  const { items } = useRequests();
  const d = r.decision;
  const back = `/app/review/${r.runId}`;
  if (r.state.load === "notfound") return <div className="cta-band"><p className="t-heading text-fg">{ERRORS.notFoundRun(r.runId)}</p><LinkButton href="/app">{ERRORS.backToRequests}</LinkButton></div>;
  if (r.state.load === "error") return <div className="hero-error"><Badge>{ERRORS.unavailable}</Badge><p className="t-mono-ui text-fg-muted">{r.state.error?.message}</p><Button variant="accent" onClick={r.refresh}>{ERRORS.tryAgain}</Button></div>;
  const vendor = d?.resolved.vendor_name ?? items?.find((i) => i.request_id === d?.request_id)?.claimed_name ?? "";
  const partial = r.state.envelope?.status === "partial_success";
  const stable = d ? (r.state.rawDecision ?? d) : null;
  return (
    <>
      {d ? <style>{`@page { @top-center { content: "${DOSSIER.pageHeader(d.request_id)} · page " counter(page); font: 9pt monospace; } }`}</style> : null}
      <div className="ds-toolbar" data-testid="dossier-toolbar">
        <Button onClick={() => window.print()} disabled={!d} data-testid="dossier-print">{DOSSIER.print}</Button>
        <Button onClick={() => stable && d && downloadText(`${d.request_id}-${d.decision_id}.json`, prettyJson(stable))} disabled={!d} data-testid="dossier-json">{DOSSIER.json}</Button>
        <Button onClick={async () => { if (d?.callback_scripts[0]) notify((await copyText(d.callback_scripts.map(scriptText).join("\n\n"))) ? TOASTS.scriptCopied : "Couldn't copy", "agree"); }} disabled={!d?.callback_scripts.length}>{DOSSIER.copyScript}</Button>
        <Link href={back} className="p-btn p-btn--ghost"><ArrowLeft size={16} /><span>{DOSSIER.back}</span></Link>
      </div>
      <article className="ds" data-testid="dossier">
        {d?.mode === "sample" && d.labels.mode_banner ? <NoticeAlert text={d.labels.mode_banner} /> : null}
        <NoticeAlert text={d?.labels.synthetic_notice ?? FIXED.syntheticNotice} />
        {partial ? <NoticeAlert tone="gap" text={DOSSIER.partial(d?.limitations.join(" ") || "see the model ledger and banners on the review page")} /> : null}
        <header className="ds-head">
          <Badge>{DOSSIER.badge}</Badge>
          <h1 className="t-display"><span className="text-fg">{DOSSIER.title}</span><br /><span className="text-fg-2">{vendor}</span></h1>
          {d ? <p className="t-mono-ui text-fg-muted t-wrap-any" data-testid="dossier-meta">{DOSSIER.head(d.request_id, vendor, d.resolved.vendor_id ?? "no vendor of record", stamp(d.decided_at), d.policy_version, r.runId, d.mode)}</p> : null}
        </header>
        {!d ? (
          r.state.load === "loading" ? <p className="t-ui text-fg-muted" data-testid="loading">{DOSSIER.loading}</p> : <Alert tone="gap"><TwoTone fact={DOSSIER.notDecided} /></Alert>
        ) : (
          <>
            <DecisionSection d={d} />
            <MoneySection d={d} />
            <ReasonsSection d={d} />
            <ScriptSection d={d} />
            <SweepSection d={d} />
            <ConflictsSection d={d} />
            <EvidenceSection d={d} runId={r.runId} />
            <EditsSection d={d} />
            <RememberedSection d={d} />
            <TailSections d={d} />
          </>
        )}
      </article>
    </>
  );
}

export function DossierPage({ runId }: { runId: string }) {
  const { state, refresh } = useRun(runId);
  return (
    <ReviewProvider runId={runId} state={state} refresh={refresh}>
      <Body />
    </ReviewProvider>
  );
}

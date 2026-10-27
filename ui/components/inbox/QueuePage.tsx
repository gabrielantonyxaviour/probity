"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRequests, nextRun } from "@/lib/requests-store";
import type { InboxItem } from "@/lib/contracts";
import { Badge } from "@/components/ui/chip";
import { Alert, Skeleton, TwoTone } from "@/components/ui/misc";
import { Button, LinkButton } from "@/components/ui/button";
import { PillTabs, Segmented } from "@/components/ui/tabs";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { useReady } from "@/components/shell/ReadyProvider";
import { QUEUE, ERRORS } from "@/lib/copy";
import { runDate } from "@/lib/format";
import { erpClosed } from "@/lib/labels";
import { dayDate } from "@/lib/format";
import { RequestCard, RequestTableRow } from "./RequestRow";

type Tab = "review" | "decided" | "all";
const TAB_KEY = "pp-queue-tab";

const decided = (i: InboxItem) => !!i.latest_run?.decision || (!i.latest_run && erpClosed(i.erp_status));
const toReview = (i: InboxItem) => !decided(i);

function loadTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === "review" || t === "decided" || t === "all") return t;
  } catch {
    /* storage blocked: default tab */
  }
  return "review";
}

function Head({ tab, setTab, counts, run }: { tab: Tab; setTab: (t: Tab) => void; counts: Record<Tab, number>; run: ReturnType<typeof nextRun> }) {
  const bp = useBreakpoint();
  const items = [
    { id: "review" as const, label: QUEUE.tabs.review, count: counts.review },
    { id: "decided" as const, label: QUEUE.tabs.decided, count: counts.decided },
    { id: "all" as const, label: QUEUE.tabs.all, count: counts.all },
  ];
  return (
    <div className="page-head page-head--split">
      <div className="grid gap-4">
        <Badge>{QUEUE.crumb}</Badge>
        <h1 className="t-app-title text-fg">{QUEUE.title}</h1>
        <p className="t-ui measure-body"><TwoTone fact={QUEUE.sub} context={QUEUE.tagline} /></p>
      </div>
      <div className="page-head__aside">
        {bp === "narrow" ? (
          <Segmented tabs full large label="Request filter" value={tab} onChange={setTab} items={items.map((i) => ({ id: i.id, label: `${i.label} ${i.count}` }))} />
        ) : (
          <PillTabs label="Request filter" value={tab} onChange={setTab} items={items} />
        )}
        <Badge>{QUEUE.demoChip}</Badge>
        {run ? (
          <p className="t-mono-ui text-fg-muted" data-testid="next-run">
            {QUEUE.nextRun} {run.payment_run_id} · {runDate(run.scheduled_date)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div data-testid="loading" aria-busy="true">
      <table className="q-table" aria-label="Loading requests">
        <thead><tr><th>{QUEUE.columns.received}</th><th>{QUEUE.columns.from}</th><th>{QUEUE.columns.change}</th><th>{QUEUE.columns.status}</th><th /></tr></thead>
        <tbody>
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i} className="q-row q-skel-row"><td><Skeleton w="70%" /></td><td><Skeleton w="80%" /></td><td><Skeleton w="60%" /></td><td><Skeleton w="50%" /></td><td /></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueuePage() {
  const { items, error, loading, reload } = useRequests({ poll: true });
  const { ready } = useReady();
  const bp = useBreakpoint();
  const [tab, setTab] = useState<Tab>("review");
  useEffect(() => setTab(loadTab()), []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* storage blocked: the tab simply is not remembered */
    }
  };

  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => b.received_at.localeCompare(a.received_at)), [items]);
  const counts = { review: sorted.filter(toReview).length, decided: sorted.filter(decided).length, all: sorted.length };
  const shown = tab === "review" ? sorted.filter(toReview) : tab === "decided" ? sorted.filter(decided) : sorted;

  const zetarisDown = ready?.mode === "live" && ready.checks.zetaris_query.status !== "ok";
  const blocked = !!zetarisDown && ready?.ready === false;
  const host = (ready?.checks.zetaris_query as { host?: string } | undefined)?.host ?? "the configured host";

  let body;
  if (error && !items) {
    body = (
      <div className="p-4" style={{ padding: "var(--app-P)" }}>
        <Alert tone="conflict" role="alert" testId="error-banner" actions={<Button onClick={() => void reload()}>{ERRORS.tryAgain}</Button>}>
          <TwoTone fact={QUEUE.loadFailed} context={error.message} />
        </Alert>
      </div>
    );
  } else if (!items) body = <Loading />;
  else if (shown.length === 0) {
    const e = tab === "decided" ? QUEUE.emptyDecided : QUEUE.emptyReview;
    body = (
      <div className="cta-band" data-testid="empty-state">
        <p className="t-heading text-fg">{e.title}</p>
        <p className="t-ui text-fg-muted">{e.body}</p>
        {tab !== "decided" ? <LinkButton href="/app/new" icon={<Plus />}>New request</LinkButton> : null}
      </div>
    );
  } else if (bp === "narrow") {
    body = (
      <div className="q-cards" data-testid="inbox">
        {shown.map((i) => <RequestCard key={`${i.request_id}${i.example_id}`} item={i} blocked={blocked} confirmDown={!!zetarisDown && !blocked} />)}
      </div>
    );
  } else {
    const wide = bp === "wide";
    body = (
      <div className="q-table-wrap">
        <table className="q-table" data-testid="inbox">
          <colgroup>
            <col style={{ width: wide ? 208 : 188 }} /><col /><col style={{ width: wide ? 240 : 196 }} />{wide ? <col style={{ width: 152 }} /> : null}<col style={{ width: wide ? 232 : 200 }} /><col style={{ width: wide ? 128 : 148 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{QUEUE.columns.received}</th><th scope="col">{QUEUE.columns.from}</th><th scope="col">{QUEUE.columns.change}</th>
              {wide ? <th scope="col">{QUEUE.columns.run}</th> : null}
              <th scope="col">{QUEUE.columns.status}</th><th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i, n) => (
              <RequestTableRow key={`${i.request_id}${i.example_id}`} item={i} wide={wide} blocked={blocked} confirmDown={!!zetarisDown && !blocked} newDay={n > 0 && dayDate(shown[n - 1].received_at) !== dayDate(i.received_at)} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <Head tab={tab} setTab={choose} counts={counts} run={nextRun(items)} />
      {zetarisDown ? (
        <div style={{ padding: "12px var(--app-P) 0" }}>
          <Alert tone="gap" role="status">
            {blocked ? QUEUE.zetarisDownBlocked(host) : <TwoTone fact="Zetaris unreachable" context="Checks use offline captures." />}
          </Alert>
        </div>
      ) : null}
      {loading && items ? <span className="sr-only" role="status">Refreshing</span> : null}
      {body}
    </div>
  );
}

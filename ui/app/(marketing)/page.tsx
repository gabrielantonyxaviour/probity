import { Cases } from "@/components/landing/Cases";
import { CheckOurWork } from "@/components/landing/CheckOurWork";
import { CtaBand } from "@/components/landing/CtaBand";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItRuns } from "@/components/landing/HowItRuns";
import { LeavesBehind } from "@/components/landing/LeavesBehind";
import { Outcomes } from "@/components/landing/Outcomes";
import { RunIt } from "@/components/landing/RunIt";
import { SourcesGrid } from "@/components/landing/SourcesGrid";
import { getLandingState } from "@/components/landing/data/live-state";
import { APP_HOME, dossierHref, reviewHref } from "@/components/landing/routes";

/** Runs are read from the product on every request: a new check shows up on reload. */
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const state = await getLandingState();
  const hold = state.byDecision.HOLD;
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <SourcesGrid />
        <HowItRuns
          watchHref={hold ? reviewHref(hold.run_id) : APP_HOME}
          dossierHref={hold ? dossierHref(hold.run_id) : APP_HOME}
          sample={hold?.mode === "sample"}
        />
        <Outcomes runs={state.byDecision} api={state.api} />
        <LeavesBehind hold={hold} />
        <Cases />
        <RunIt hold={hold} />
        <CheckOurWork state={state} />
        <CtaBand />
      </main>
      <Footer hold={hold} />
    </>
  );
}

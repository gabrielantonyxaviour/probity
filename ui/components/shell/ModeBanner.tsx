"use client";
import { useEffect, useRef } from "react";
import { Banner } from "@/components/ui/misc";
import { FIXED, SHELL } from "@/lib/copy";
import { useReady } from "./ReadyProvider";

// Dev only: inlined at build time, so the production bundle never contains the fixture banner text.
const FIXTURES = process.env.NEXT_PUBLIC_UI_FIXTURES === "1";

/** SAMPLE banner (spine 4.7 exact) and the dev-only fixture banner. Never dismissible; sticky under the header. */
export function ModeBanner() {
  const { ready } = useReady();
  const ref = useRef<HTMLDivElement>(null);
  const sample = ready?.mode === "sample";
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--banner-live", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--banner-live");
    };
  }, [sample]);
  if (!sample && !FIXTURES) return null;
  return (
    <div ref={ref} className="app-banners">
      {sample ? (
        <Banner tone="info" tag={SHELL.sampleTag} testId="mode-banner">
          {FIXED.sampleBanner}
        </Banner>
      ) : null}
      {process.env.NEXT_PUBLIC_UI_FIXTURES === "1" ? (
        <Banner tone="gap" tag="Fixture" testId="fixture-banner">
          {"FIXTURE DATA: hand-written for UI development; not a run."}
        </Banner>
      ) : null}
    </div>
  );
}

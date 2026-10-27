"use client";
import { useMemo } from "react";
import { Banner } from "@/components/ui/misc";
import { buildBanners } from "@/lib/model/banners";
import { useReview } from "./review-context";

/** R-BANNERS: absent (not empty) on a clean live run. Gap tone, never dismissible. */
export function Banners() {
  const { state, decision } = useReview();
  const banners = useMemo(() => buildBanners({ trace: state.trace, decision, live: state.observations }), [state.trace, decision, state.observations]);
  if (banners.length === 0) return null;
  return (
    <div className="rv-banners" data-testid="review-banners">
      {banners.map((b) => (
        <Banner key={b.key} tone="gap" tag={b.tag} testId="source-banner">{b.text}</Banner>
      ))}
    </div>
  );
}

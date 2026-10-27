"use client";
import { useSyncExternalStore } from "react";

export type Breakpoint = "narrow" | "medium" | "wide";

function query(): Breakpoint {
  if (typeof window === "undefined") return "wide";
  const w = window.innerWidth;
  return w >= 1440 ? "wide" : w >= 768 ? "medium" : "narrow";
}
function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
/** Product widths: narrow < 768, medium 768 to 1439, wide >= 1440 (spec 01 section 17.1). */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, query, () => "wide");
}

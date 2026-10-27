"use client";
// URL-backed UI state (?evidence= ?query= ?memory= ?log= ?outcome=1 ?trace=full ?letter=full ?graph=full) so a reload keeps it.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: Listener) {
  listeners.add(l);
  window.addEventListener("popstate", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("popstate", l);
  };
}
const snapshot = () => window.location.search;
const serverSnapshot = () => "";

/** Reads and writes search params with history.replaceState / pushState (Next syncs them into useSearchParams). */
export function useUrlParams() {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const params = new URLSearchParams(search);
  const set = useCallback((updates: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (mode === "push") window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
    emit();
  }, []);
  return { params, get: (k: string) => params.get(k), set };
}

let lastTrigger: HTMLElement | null = null;
function track(e: Event) {
  const t = e.target as HTMLElement | null;
  if (!t || !(t instanceof HTMLElement) || t.closest("[data-overlay]")) return;
  const el = t.closest<HTMLElement>("button, a, [role='button'], [tabindex]");
  if (el) lastTrigger = el;
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", track, true);
  window.addEventListener("focusin", track, true);
}

/** Remembers the control that opened an overlay and restores focus to it when the overlay closes (Esc returns focus). */
export function useFocusReturn(open: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      ref.current = lastTrigger;
      return;
    }
    const el = ref.current;
    ref.current = null;
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus());
  }, [open]);
}

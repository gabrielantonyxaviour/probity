"use client";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: ReactNode; testId?: string };

/** Pill tabs with one sliding indicator (RULES section 5). Arrow keys move selection; roving tabindex. */
export function PillTabs<T extends string>({ items, value, onChange, label, small, className }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; small?: boolean; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    list.querySelectorAll("button").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [value, items.length]);

  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    else return;
    e.preventDefault();
    onChange(items[n].id);
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[n]?.focus());
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKey} className={cn("p-tabs", small && "p-tabs--sm", className)}>
      {ind ? <span className="p-tabs__ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden /> : null}
      {items.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} data-testid={t.testId} className={cn("p-tab", small && "p-tab--sm")} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null ? <span className="p-tab__n tabular">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export type SegItem<T extends string> = { id: T; label: ReactNode; testId?: string };

/** Segmented control: toggle (pressed) semantics for view switches, tab semantics when `tabs` is set. */
export function Segmented<T extends string>({ items, value, onChange, label, full, large, tabs, className }: { items: SegItem<T>[]; value: T; onChange: (id: T) => void; label: string; full?: boolean; large?: boolean; tabs?: boolean; className?: string }) {
  return (
    <div role={tabs ? "tablist" : "group"} aria-label={label} className={cn("p-seg", full && "p-seg--full", large && "p-seg--lg", className)}>
      {items.map((t) => (
        <button key={t.id} type="button" role={tabs ? "tab" : undefined} {...(tabs ? { "aria-selected": t.id === value } : { "aria-pressed": t.id === value })} data-testid={t.testId} className="p-seg__b" onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

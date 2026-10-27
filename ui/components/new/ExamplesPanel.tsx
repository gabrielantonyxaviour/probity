"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadExamples } from "@/lib/start-run";
import { NEW } from "@/lib/copy";

type Ex = Awaited<ReturnType<typeof loadExamples>>;

/** Right-hand help: what Probity reads, and the demo inputs from GET /examples (typed ones fill the form). */
export function ExamplesPanel({ onTyped }: { onTyped: (name: string) => void }) {
  const [ex, setEx] = useState<Ex>([]);
  useEffect(() => {
    loadExamples().then(setEx).catch(() => undefined);
  }, []);
  return (
    <>
      <div className="nw__help-card">
        <h2 className="t-eyebrow">{NEW.helpTitle}</h2>
        <p className="t-ui-sm text-fg-2">{NEW.helpBody}</p>
      </div>
      {ex.length ? (
        <div className="nw__help-card" data-testid="examples-panel">
          <h2 className="t-eyebrow">{NEW.examplesTitle}</h2>
          <p className="t-ui-sm text-fg-muted">{NEW.examplesBody}</p>
          <ul className="tiles">
            {ex.map((e) => {
              const name = (e.request.input as { vendor?: { legal_name?: string } }).vendor?.legal_name;
              // Some typed examples ship without a human title (title == id): name them from their own typed input.
              const title = e.title && e.title !== e.example_id ? e.title : name ? NEW.typedExample(name) : e.example_id;
              const tag = e.scenario ?? (e.kind === "typed" ? NEW.typedTag : e.example_id);
              const inner = <><span className="t-ui-sm text-fg block">{title}</span><span className="t-mono-label text-fg-muted block mt-1">{tag}</span></>;
              return (
                <li key={e.example_id}>
                  {e.kind === "typed" && name ? <button type="button" className="p-tile" onClick={() => onTyped(name)}>{inner}</button> : <Link href="/app" className="p-tile">{inner}</Link>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}

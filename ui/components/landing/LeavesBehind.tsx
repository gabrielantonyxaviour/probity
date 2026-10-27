import { ArrowRight, Database, FileText, ListTree, Network, Phone, Receipt, RotateCcw, ScanSearch, Table2 } from "lucide-react";
import type { ComponentType } from "react";
import Link from "next/link";
import { LEAVES } from "./copy-more";
import type { LandingRun } from "./data/live-state";
import { APP_HOME, dossierHref, evidenceHref, reviewHref, viewHref } from "./routes";

const ICONS: Record<string, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  Table2, Database, RotateCcw, ListTree, Network, Receipt, FileText, Phone, ScanSearch,
};

function target(to: string, run: LandingRun | undefined): string {
  if (!run) return APP_HOME;
  switch (to) {
    case "evidence": return run.t11_evidence_id ? evidenceHref(run.run_id, run.t11_evidence_id) : reviewHref(run.run_id);
    case "trace": return viewHref(run.run_id, "trace");
    case "graph": return viewHref(run.run_id, "graph");
    case "dossier": return dossierHref(run.run_id);
    default: return reviewHref(run.run_id);
  }
}

/** Section 5: what every check leaves behind. Each row opens the matching region of the latest HOLD run. */
export function LeavesBehind({ hold }: { hold: LandingRun | undefined }) {
  return (
    <section id="check" className="l-section" aria-labelledby="leaves-h">
      <div className="l-frame l-content">
        <h2 id="leaves-h" className="t-heading l-leaves-h">{LEAVES.heading}</h2>
        <div className="l-leaves">
          {LEAVES.groups.map((g) => (
            <div key={g.name} className="l-leaf-group">
              <h3 className="l-leaf-name">{g.name}</h3>
              <ul className="l-leaf-list">
                {g.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <li key={item.title} className="l-leaf">
                      <Link href={target(item.to, hold)} className="l-leaf-link">
                        <span className="l-leaf-icon"><Icon size={20} aria-hidden /></span>
                        <span className="l-leaf-title">{item.title}</span>
                        <span className="l-leaf-arrow"><ArrowRight size={16} aria-hidden /></span>
                        <span className="l-leaf-desc">{item.body}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

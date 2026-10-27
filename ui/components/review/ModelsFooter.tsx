"use client";
import { NemotronJobs } from "./NemotronJobs";
import { ModelLedger } from "./ModelLedger";

/** R-MODELS: "What Nemotron did" (expanded after the decision) above the collapsed model ledger. */
export function ModelsFooter({ onFilter }: { onFilter?: (seqs: number[]) => void }) {
  return (
    <div className="rv-models" data-testid="models-footer">
      <NemotronJobs onFilter={onFilter} />
      <ModelLedger />
    </div>
  );
}

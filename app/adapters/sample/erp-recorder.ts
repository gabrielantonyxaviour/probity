// Live mode keeps its ERP rows in Postgres, which the offline captures cannot see. When Zetaris goes down mid-run (ZETARIS_DOWN_POLICY=degrade)
// the sample Zetaris port still has to see the request this run just inserted (T07, T08b) and the call-backs logged since boot. This wrapper
// forwards every ErpWriterPort call unchanged and remembers the rows it wrote, as the same `snapshot()` the in-memory sample writer offers.
import type { ErpWriterPort } from "../../schemas/ports";
import type { Row } from "./sample-store";

const KEEP = 500;

export type RecordedErp = ErpWriterPort & { snapshot(): { requests: Row[]; callbacks: Row[] } };

export function recordErpWrites(inner: ErpWriterPort): RecordedErp {
  const requests = new Map<string, Row>();
  const callbacks: Row[] = [];
  const trim = (): void => {
    while (requests.size > KEEP) requests.delete(requests.keys().next().value as string);
    if (callbacks.length > KEEP) callbacks.splice(0, callbacks.length - KEEP);
  };
  return {
    nextRequestId: () => inner.nextRequestId(),
    async insertRequest(row) {
      const res = await inner.insertRequest(row);
      requests.set(res.request_id, { ...row });
      trim();
      return res;
    },
    insertDocuments: (rows) => inner.insertDocuments(rows),
    async setRequestStatus(id, status) {
      await inner.setRequestStatus(id, status);
      const r = requests.get(id);
      if (r) requests.set(id, { ...r, status });
    },
    async insertCallback(row) {
      const res = await inner.insertCallback(row);
      callbacks.push({ ...row, log_id: res.log_id });
      trim();
      return res;
    },
    ping: (o) => inner.ping(o),
    snapshot: () => ({ requests: [...requests.values()], callbacks: [...callbacks] }),
  };
}

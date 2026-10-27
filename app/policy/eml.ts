// Email header parser (code wins over A1 values, 04 §2.2 step 2). Headers only, no body, no model.
import { normaliseDomain } from "./normalise";

export type ParsedEml = {
  from_email: string | null;
  from_domain: string | null;
  reply_to_email: string | null;
  reply_to_domain: string | null;
  date: string | null; // ISO
  subject: string | null;
};

function unfold(raw: string): Map<string, string> {
  const head = raw.replace(/\r\n/g, "\n").split(/\n\n/)[0] ?? "";
  const out = new Map<string, string>();
  let key: string | null = null;
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && key) {
      out.set(key, `${out.get(key) ?? ""} ${line.trim()}`);
      continue;
    }
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (m) {
      key = m[1]!.toLowerCase();
      if (!out.has(key)) out.set(key, m[2]!.trim());
      else key = null; // keep the first occurrence only
    }
  }
  return out;
}

function addressOf(v: string | undefined): string | null {
  if (!v) return null;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(v);
  const bare = /([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(v);
  const a = (angle?.[1] ?? bare?.[1] ?? null)?.toLowerCase() ?? null;
  return a;
}

export function parseEml(raw: string | null | undefined): ParsedEml | null {
  if (!raw || raw.trim().length === 0) return null;
  const h = unfold(raw.slice(0, 65_536));
  const from = addressOf(h.get("from"));
  const reply = addressOf(h.get("reply-to"));
  const d = h.get("date") ? new Date(h.get("date")!) : null;
  return {
    from_email: from,
    from_domain: from ? normaliseDomain(from) : null,
    reply_to_email: reply,
    reply_to_domain: reply ? normaliseDomain(reply) : null,
    date: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    subject: h.get("subject") ?? null,
  };
}

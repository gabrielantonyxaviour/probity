// Minimal .eml header reader (06 §2.1: no mailparser). Reads headers only: up to the first blank line, at most 64 KB,
// with RFC 5322 folded lines joined. Used for the upload response; the orchestrator's own parser decides policy facts.
export type EmlHeaders = { from: string | null; reply_to: string | null; date: string | null };

export function parseEmlHeaders(buf: Uint8Array): EmlHeaders {
  const text = Buffer.from(buf.subarray(0, 64 * 1024)).toString("utf8").replace(/\r\n/g, "\n");
  const head = text.split(/\n\n/, 1)[0] ?? "";
  const lines: string[] = [];
  for (const raw of head.split("\n")) {
    if (/^[ \t]/.test(raw) && lines.length) lines[lines.length - 1] += ` ${raw.trim()}`;
    else lines.push(raw);
  }
  const get = (name: string): string | null => {
    const l = lines.find((x) => x.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    const v = l?.slice(name.length + 1).trim();
    return v ? v : null;
  };
  const date = get("Date");
  const parsed = date ? new Date(date) : null;
  return { from: get("From"), reply_to: get("Reply-To"), date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : date };
}

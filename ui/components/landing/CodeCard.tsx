import type { ReactNode } from "react";

/** Em-scaled panel (DESIGN_SYSTEM_RULES section 5): one font size, every child in em. Shared with the product's query panel. */
export function CodeCard({ title, children, fade = false }: { title: string; children: ReactNode; fade?: boolean }) {
  return (
    <div className={fade ? "l-code l-code--fade" : "l-code"}>
      <p className="l-code-head">{title}</p>
      <div className="l-code-body">{children}</div>
    </div>
  );
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b/g;

/** Minimal JSON colouring from the code tokens (keys neutral, strings olive, numbers cobalt). No libraries. */
export function JsonLines({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const cls = m[1] ? (m[2] ? "j-key" : "j-str") : m[3] ? "j-num" : "j-kw";
    nodes.push(
      <span key={k++} className={cls}>
        {m[1] ? m[1] : m[0]}
      </span>,
    );
    if (m[2]) nodes.push(m[2]);
    last = at + m[0].length;
  }
  nodes.push(text.slice(last));
  return <pre className="l-pre">{nodes}</pre>;
}

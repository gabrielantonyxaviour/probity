// Landing copy, part 1 (header, hero, sources, how a check runs, three answers). Source: LANDING_BLUEPRINT.md plus the
// claim-limit edits in the lane brief. Banned in any visible text, aria-* or title (spec 01 section 11.9): the f-word
// for payment crime in any form, the r-words for matching, ai-powered, magic, guaranteed, confidence score, the
// clock-speed word for real time. Use "payment diversion", "impersonation" and "business email compromise".
export const CTA_LABEL = "SEE A LIVE CHECK →";
export const GITHUB_LABEL = "GITHUB";

export const NAV_ITEMS = [
  { label: "HOW IT WORKS", href: "#how" },
  { label: "OUTCOMES", href: "#outcomes" },
  { label: "WHAT YOU GET", href: "#check" },
  { label: "CASES", href: "#cases" },
  { label: "RUN IT", href: "#run" },
] as const;

export const HERO = {
  line1: "Prove who is asking",
  line2: "before the money moves",
  lede: "Probity checks a vendor’s bank-detail change against your vendor master, payment history and public registries, then says approve, call back or hold.",
  ledeMuted: "Every fact links to the query that produced it.",
  primary: CTA_LABEL,
  secondary: "VIEW ON GITHUB",
  announcement: "WHY: A $23.5M PAYMENT DIVERSION →",
  sources: "REGISTRY FACTS ARE READ LIVE FROM USASPENDING AND SEC EDGAR",
  matrixCaption: "Animation: a stream of payments flows right; one diverted payment is stopped at a gate.",
  gateLabel: "HELD BEFORE RELEASE",
} as const;

export type SourceCell = { label: string; dot?: "internal" | "real"; pop: string; tag: "read" | "does" };

export const SOURCES_HEADING = { lead: "CHECKED AGAINST", count: "4", tail: "SOURCES" } as const;

/** Row 1 order (heading sits between the two internal and the two live cells), then row 2. */
export const SOURCE_CELLS: readonly SourceCell[] = [
  { label: "VENDOR MASTER", dot: "internal", tag: "read", pop: "Your vendor records: names, addresses, bank details and contacts, with change dates." },
  { label: "PAYMENT HISTORY", dot: "internal", tag: "read", pop: "The AP ledger: this vendor’s items in the next payment run." },
  { label: "USASPENDING", dot: "real", tag: "read", pop: "Real federal award recipients and their parent companies, by UEI." },
  { label: "SEC EDGAR", dot: "real", tag: "read", pop: "Real filings: registered addresses, former names, and the phone number a call-back should use." },
  { label: "ZETARIS", tag: "does", pop: "Joins our records, USAspending and SEC EDGAR in one semantic layer. Agents pick a query template; they never write SQL." },
  { label: "NVIDIA NEMOTRON", tag: "does", pop: "Reads the letter, judges identity links and writes the summary. Every call is logged with its model." },
  { label: "METERLESS NIGHTSHIFT", tag: "does", pop: "Routes every model call and records which model answered." },
  { label: "METERLESS WORLD MODEL", tag: "does", pop: "Remembers entities across sessions, so a confirmed impersonation is recognised next time." },
  { label: "4 AGENTS", tag: "does", pop: "Letter Reader, Registry Scout, Identity Examiner, Gate Officer." },
  { label: "0 LINES OF SQL BY AGENTS", tag: "does", pop: "Every query comes from an allow-listed template with typed parameters." },
];

export const HOW = {
  heading: { before: "Every claim gets ", em: "cross-examined" },
  lede: "A change letter makes claims: who sent it, where to pay, which account, which number to call. Probity tests each one against records the letter could not have written.",
  watchLatest: "Watch the latest check",
  watchSample: "Watch a sample check",
  dossierLatest: "OPEN THE DOSSIER →",
  dossierSample: "OPEN A SAMPLE DOSSIER →",
  legend: [
    { glyph: "✓", word: "APPROVE", key: "approve" },
    { glyph: "○", word: "CALL BACK FIRST", key: "callback" },
    { glyph: "✕", word: "HOLD", key: "hold" },
  ],
} as const;

export type Step = { eyebrow: string; num: string; title: string; heading: string; body: string; accent: string };

export const STEPS: readonly Step[] = [
  {
    num: "01", title: "READ THE LETTER", eyebrow: "01 READ THE LETTER", heading: "Read", accent: "var(--step-read)",
    body: "Letter Reader, on NVIDIA Nemotron, quotes every claim in the letter and flags pressure phrases, like an instruction to stop using the old phone number.",
  },
  {
    num: "02", title: "GATHER EVIDENCE", eyebrow: "02 GATHER EVIDENCE", heading: "Gather", accent: "var(--step-gather)",
    body: "A coverage rule runs a fixed set of Zetaris queries across your records, USAspending and SEC EDGAR, and walks the corporate family to whoever sits at the new address. Registry Scout, on NVIDIA Nemotron, can add checks on top.",
  },
  {
    num: "03", title: "CHALLENGE", eyebrow: "03 CHALLENGE", heading: "Challenge", accent: "var(--step-challenge)",
    body: "Identity Examiner tests every link the Scout proposes. When the evidence is thin it sends the Scout back, and it re-runs the decisive query to prove the rows did not change.",
  },
  {
    num: "04", title: "DECIDE", eyebrow: "04 DECIDE", heading: "Decide", accent: "var(--step-decide)",
    body: "Gate Officer applies one written policy: approve, call back first, or hold. The call-back number comes from SEC EDGAR or from records on file before the request, never from the letter.",
  },
];

export const PLATES = [
  { id: "letter", name: "THE LETTER", note: "CLAIMS · PRESSURE PHRASE" },
  { id: "records", name: "OUR RECORDS", note: "VENDOR MASTER · CHANGE DATES" },
  { id: "awards", name: "USASPENDING", note: "FAMILY → 1 AT THIS ADDRESS" },
  { id: "filings", name: "SEC EDGAR", note: "CALL-BACK NUMBER ON FILE" },
] as const;

export const ANSWERS = {
  heading: "Approve, call back or hold",
  hold: {
    title: "Hold",
    body: "A fact conflicts, or the request cannot be tied to one vendor. The change is blocked and the vendor’s items in the run are flagged for review.",
    features: ["Names the record that conflicts", "Lists the payments at stake", "Hands over a call-back script"],
    pill: "SEE A HOLD →",
  },
  callback: {
    title: "Call back first",
    body: "Nothing conflicts, but the proof is incomplete. Probity scripts a call to a number from SEC EDGAR or USAspending, and lists the numbers not to use.",
    caption: "The control federal guidance names: call a known contact on a number already on file, never one in the request (Commerce OIG, Jul 2026).",
    pill: "SEE A CALL-BACK →",
  },
  approve: {
    title: "Approve",
    body: "Every decisive fact agrees with live evidence, and an independent call-back already confirmed the change. A person still applies it in the ERP.",
    pill: "SEE AN APPROVAL →",
  },
  empty: "No check has reached this answer yet.",
  down: "The Probity API is not reachable from this page.",
  openQueue: "OPEN THE QUEUE →",
} as const;

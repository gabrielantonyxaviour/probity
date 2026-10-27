// Review, trace, graph, evidence, dialog and dossier strings (01 sections 7, 8, 9, 10, 17; EP-1 to EP-28).
export const REVIEW = {
  crumb: "Change requests",
  exportDossier: "Export dossier",
  runAgain: "Run again",
  stopCheck: "Stop check",
  stopConfirm: "Stop this check? Nothing is decided and nothing changes.",
  stopYes: "Stop check",
  stopKeep: "Keep running",
  menu: {
    outage: "Run again with simulated USAspending outage (test hook)",
    decisionJson: "Download decision JSON",
    traceJsonl: "Download trace (JSONL)",
    outcome: "Record final outcome",
    note: "Add analyst note",
    fullTrace: "Open in full-width trace view",
    downloads: "Downloads",
  },
  previousCheck: (label: string) => `Previous check: ${label}`,
  history: "Checks on this request",
  historyNow: "This check",
  runMeta: (id: string, received: string, channel: string) => `${id} · received ${received} · ${channel}`,
  decisionBelow: "Decision appears when the Gate Officer applies policy. Nothing changes in the ERP.",
  elapsed: (mmss: string) => `${mmss} of 8:00`,
  roundOf: (n: number) => `Round ${n} of 2`,
  checkedIn: (secs: number, rounds: number) => `Checked in ${secs} s · ${rounds} revision round(s)`,
  waiting: (elapsed: string) => `Waiting for the next step… ${elapsed}`,
  loadingRun: "Loading the check",
  stoppedBy: (mmss: string) => `Stopped by you at ${mmss}. Nothing was decided.`,
  runningChip: (step: string) => `Checking… ${step}`,
  cancelling: "Stopping…",
  inputExpired: "Upload expired; upload again",
} as const;

export const EXPO = {
  head: "Money at stake",
  run: (id: string, date: string, cutoff: string) => `${id} · ${date} · cut-off ${cutoff}`,
  vendor: ["This vendor:", (n: string, amount: string) => `${n} · ${amount}`],
  candidates: ["Possible vendors:", (n: string, amount: string) => `${n} · ${amount}`],
  noVendor: ["This vendor:", "not one of our vendors"],
  wholeRun: ["Whole run:", (n: string, amount: string) => `${n} · ${amount}`],
  hold: ["On hold for review:", (n: string) => n],
  sweep: ["Also flagged by the sweep:", (n: string, amount: string) => `${n} item(s) · ${amount}`],
} as const;

export const BANNERS = {
  zetarisDegraded: (capturedAt: string) => `Zetaris unreachable: evidence from offline captures dated ${capturedAt}.`,
  nightshiftFallback: (lane: string, fallback: string) =>
    `Nightshift did not answer on the ${lane} lane. Probity used its fallback: ${fallback}.`,
  nonNemotron: (model: string) =>
    `A step was answered by a model that is not Nemotron (${model}). See the model ledger.`,
  timeLimit: "Time limit reached at 8:00. Decided on the evidence gathered so far; links not yet examined stay held.",
  sourceMissing: (source: string) =>
    `${source} could not be reached and no captured copy exists for this company. Facts from ${source} are missing.`,
  tags: { mirror: "Mirror", outage: "Outage", zetaris: "Zetaris", model: "Model", time: "Time limit", partial: "Partial" },
} as const;

export const PANELS = {
  needsHuman: {
    title: "We couldn't read this letter",
    body: "Nemotron and the OCR fallback could not extract the claims with quotes. Nothing was decided and nothing changed.",
    typeInstead: "Type the details instead",
    uploadClearer: "Upload a clearer copy",
  },
  needsHumanModel: {
    title: "A model lane was not available",
    body: "The letter could not be read because no model lane answered. Nothing was decided and nothing changed.",
  },
  runError: {
    title: "The check stopped before a decision",
    body: (error: string) => `${error} Nothing was decided and no details changed.`,
  },
  decisionPending: "Deciding…",
} as const;

export const DECISION = {
  why: "Why",
  doThisNow: "Do this now",
  alsoNoted: (n: number) => `Also noted (${n})`,
  evidence: (n: number) => `Evidence (${n})`,
  more: "More",
  less: "Less",
  coverage: (w: number, d: number) => `Evidence coverage: ${w} of ${d} decisive facts have live evidence.`,
  coverageTail: (sources: string) => ` Backup data used for: ${sources}.`,
  summary: "Summary",
  readFull: "Read full summary",
  collapse: "Show less",
  writtenBy: (model: string) => `Written by ${model}`,
  numbersChecked: "numbers checked against the decision",
  regenerated: "regenerated once after a number check",
  templateText: "Template text: the model's wording failed the number check twice.",
  writing: "Writing the summary…",
  runFacts: (v: string, rounds: number, secs: number, mode: string, run: string) =>
    `Policy ${v} · ${rounds} revision round(s) · ${secs} s · mode ${mode} · run ${run}`,
  callbackRow: (id: string, phone: string, by: string, date: string, q: string) =>
    `Call-back ${id} on ${phone} (SEC EDGAR) by ${by}, ${date} · query ${q}`,
  remembered: "Remembered",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  wrong: "Wrong",
  markedHelpful: "Marked helpful",
  receiptLabel: "Written by Nemotron",
} as const;

export const SCRIPT = {
  one: "Call-back script",
  many: "Call-back scripts (one per possible vendor)",
  forVendor: (name: string, id: string | null) => (id ? `For ${name} (${id})` : `For ${name}`),
  header: "// Call-back script",
  doNotUse: "Do not use",
  copy: "Copy script",
  log: "Log call-back outcome",
  none: "No independent number found; escalate to the contracting officer for a verified contact.",
  edgar: (cik: string, fetched: string) => `SEC EDGAR submissions, CIK ${cik}, fetched ${fetched}`,
  vendorMaster: (since: string) => `Vendor master, on file since ${since}`,
} as const;

export const SWEEP = {
  none: (run: string, n: number) =>
    `Not asked, but checked: no other item in ${run} fails payment controls (${n} items checked by DQ1 and DQ2).`,
  failed: (reason: string, run: string) =>
    `The run sweep could not run (${reason}). This decision is unaffected; check ${run} manually.`,
  running: (run: string) => `Checking the rest of ${run}…`,
  footer: (rule: string, invalid: number, total: number) =>
    `Found by Zetaris data-quality rules on vendor360.payment_run_item: ${rule} ${invalid} of ${total} rows invalid across all payment runs`,
  rules: { DQ1: "Recent bank change, no independent call-back", DQ2: "Account shared with another vendor" },
  recs: { hold_item: "Hold this item", callback_before_release: "Call back before release" },
} as const;

export const LETTER = {
  heading: "The request",
  typedCard: "Typed request",
  headersTab: "Email headers",
  pageTab: (n: number) => `Letter · page ${n}`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit",
  expand: "Expand letter",
  showLetter: "Show letter",
  hideLetter: "Hide letter",
  close: "Close",
  pressure: "Pressure language",
  claims: "Claims",
  noBoxes: "Positions not available; quotes listed below.",
  imageError: (n: number) => `Couldn't load page ${n}.`,
  noWatermark: "No synthetic watermark found on this document. Probity is a demo: don't upload real vendor letters or personal data.",
  notInspected:
    "Probity does not inspect images for edits. It checks every claim against independent sources, so an edited letter fails on the facts.",
  replyToDiffers: "Reply-To differs from From",
  domain: { onFile: "On file", notOnFile: "Not on file", lookalike: "Lookalike" },
  headerFields: { from: "From", replyTo: "Reply-To", subject: "Subject", date: "Date" },
  claimed: "Claims to be",
  extraction: {
    "text+deep": (m: string) => `Read by ${m} from the PDF text layer`,
    "text+fast": (m: string) => `Read by ${m} from the PDF text layer (fast lane fallback)`,
    "ocr+deep": (m: string) => `Read by OCR, then ${m} (text)`,
    "ocr+fast": (m: string) => `Read by OCR, then ${m} (fast lane fallback)`,
    typed: () => "Typed by the requester",
    sidecar: () => "Generator ground-truth fixture (SAMPLE_MODE)",
    vl: (m: string) => `Read by ${m}`,
  },
  fieldNames: {
    claimed_name: "Claimed name",
    letterhead_name: "Letterhead name",
    remit_address: "Remit-to address",
    bank_routing: "Bank routing number",
    bank_account: "Bank account",
    phone: "Phone",
    invoice_ref: "Invoice reference",
    effective_date: "Effective date",
    signer_name: "Signer",
    pressure_phrase: "Pressure phrase",
    watermark: "Watermark",
  },
  testRouting: "Test routing",
  testAccount: "Test account",
} as const;

export const FACTS = {
  heading: "Fact sheet",
  checking: "Checking…",
  captionLive:
    "Vendor-master, USAspending and SEC columns are read through Zetaris: the vendor360 semantic layer plus records registered during this check. The Claimed column is from the request. Click any cell for its query.",
  captionSample:
    "Columns come from captured rows evaluated in TypeScript (SAMPLE_MODE). Click any cell for the query that would run in Zetaris.",
  legend: [
    ["✓", "Agrees", "agree"],
    ["○", "Not found", "gap"],
    ["✕", "Conflicts", "conflict"],
    ["⇄", "Ambiguous", "conflict"],
  ] as const,
  moreN: (n: number) => `+${n} more`,
  blocked: "Blocked: no Zetaris query ID (rule B2)",
  notReached: "Not reached",
  provisional: {
    looking: "Looking further · Examiner asked for more evidence",
    flaggedScout: "Flagged by Registry Scout · final result at decision",
    flaggedExaminer: "Flagged by Identity Examiner · final result at decision",
  },
  cellLabel: (field: string, source: string, value: string) => `${field}, ${source}: ${value}. Open evidence.`,
} as const;

export const MORE = {
  conflicts: (n: number) => `Conflicts (${n})`,
  edits: "Suggested vendor-master edits",
  proposed: "Proposed, not applied",
  editsNote: "Probity never writes to the ERP. A person applies these.",
  editCols: ["Vendor", "Field", "On file", "Suggested", "Evidence"],
  gaps: "Registry data gaps",
  limits: "Limitations of this decision",
  resolved: { unresolved: "Unresolved", identity_examiner: "Resolved by Identity Examiner", policy: "Resolved by policy" },
} as const;

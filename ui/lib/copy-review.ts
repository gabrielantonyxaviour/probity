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
  sweep: ["Also flagged by the sweep:", (n: string, amount: string) => `${n} · ${amount}`],
} as const;

export const BANNERS = {
  zetarisDegraded: (capturedAt: string) => `Zetaris unreachable: evidence from offline captures dated ${capturedAt}.`,
  rationaleRejected: (cause: string | null) =>
    `Nemotron wrote a summary, but its wording did not pass Probity's check against the decision${cause ? ` (${cause})` : ""}. The summary below is written from the decision itself; the decision and its reasons are unchanged.`,
  rejectionCauses: [
    [/reasons? left out|state the reasons/, "it left out a reason the decision depends on"],
    [/unknown token/, "it used a number that is not in the evidence"],
    [/internal labels/, "it used internal labels instead of plain words"],
    [/claim not in the decision|states a problem/, "it said something the evidence does not show"],
    [/call-back|do-not-use|do_not_use/, "it did not state the call-back number correctly"],
    [/sweep|payment (count|amount)/, "it got a payment count or amount wrong"],
    [/decision word/, "it used the wrong decision word"],
    [/sentence count/, "it was too long or too short"],
  ] as ReadonlyArray<readonly [RegExp, string]>,
  nightshiftFallback: (lane: string, fallback: string) =>
    `Nightshift did not answer on the ${lane} lane. Probity used its fallback: ${fallback}.`,
  nonNemotron: (model: string) =>
    `A step was answered by a model that is not Nemotron (${model}). See the model ledger.`,
  timeLimit: "Probity stopped gathering evidence so it can decide within the 8:00 time limit. Links not yet examined stay held.",
  sourceMissing: (source: string) =>
    `${source} could not be reached and no captured copy exists for this company. Facts from ${source} are missing.`,
  tags: { mirror: "Mirror", outage: "Outage", zetaris: "Zetaris", model: "Model", wording: "Summary", time: "Time limit", partial: "Partial" },
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
  scriptUsed: "Call-back on record",
  checkedFacts: "What was checked",
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
  none: (run: string, n: number, rules = "DQ1 and DQ2") =>
    `Not asked, but checked: no other item in ${run} fails payment controls (${n} items checked by ${rules}).`,
  failed: (reason: string, run: string) =>
    `The run sweep could not run (${reason}). This decision is unaffected; check ${run} manually.`,
  running: (run: string) => `Checking the rest of ${run}…`,
  rulesHead: "Zetaris data-quality rules run for this sweep, table-wide",
  footer: (rule: string, invalid: number, total: number) =>
    `Found by Zetaris data-quality rules on vendor360.payment_run_item: ${rule} ${invalid} of ${total} rows invalid across all payment runs`,
  ruleLine: (invalid: number, total: number) => `${invalid} of ${total} rows invalid (all runs)`,
  ruleClean: (total: number) => `all ${total} rows valid`,
  sharedBy: (vendors: string[], hash8: string) => `One bank account (hash ${hash8}) on file for ${[vendors].flat().join(", ")}`,
  rules: {
    DQ1: "Recent bank change, no independent call-back",
    DQ2: "Account shared with another vendor",
    DQ7: "Bank account on file for more than one vendor",
    DQ8: "Over $100,000 within 14 days of a bank change, no verified call-back",
    DQ9: "Payee name does not match the vendor's legal name",
  },
  tables: {
    DQ1: "vendor360.payment_run_item",
    DQ2: "vendor360.payment_run_item",
    DQ7: "vendor360.vendor_bank_account",
    DQ8: "vendor360.payment_run_item",
    DQ9: "vendor360.payment_run_item + vendor",
  },
  recs: { hold_item: "Hold this item", callback_before_release: "Call back before release" },
  query: (id8: string) => `query ${id8}`,
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

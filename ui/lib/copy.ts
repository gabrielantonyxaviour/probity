// Every user-facing string of 01 sections 3, 5 to 11 and 17 lives in lib/copy*.ts so Grok's copy tests import the same constants.
// Templates with {braces} are functions: the UI fills them from API data and never invents a value (01 section 0).
import { POLICY_VERSION } from "@schemas/patterns";

export * from "./copy-review";
export * from "./copy-detail";

export const FIXED = {
  syntheticNotice:
    "Internal records and letters are synthetic, made for this demo. Registry facts are real public data from USAspending and SEC EDGAR.",
  sampleBanner:
    "SAMPLE MODE: offline data captured 2026-10-27; no live Zetaris or Nemotron calls. Decisions are computed by the same policy code.",
  mirrorLabel: (capturedAt: string) => `Registry mirror, captured ${capturedAt}. Live source unavailable.`,
  simulatedOutage: (source: string) => `Simulated outage of ${source} (test hook).`,
  sweepHeader: (k: number, run: string, amount: string) =>
    `Not asked, but checked: ${k} other item(s) in ${run} (${amount}) fail payment controls.`,
  doNotCall: "Demo scenario: do not call.",
  policy: `Policy ${POLICY_VERSION}`,
  traceIds: "Trace and query ids are shown on every result.",
} as const;

export const SHELL = {
  wordmark: "Probity",
  navRequests: "Change requests",
  newRequest: "New request",
  menu: "Menu",
  theme: "Colour theme",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  skip: "Skip to content",
  sampleTag: "Sample mode",
  systemSample: "Sample data · no live calls",
  systemLive: "Zetaris live",
  zetarisDown: "Zetaris unreachable",
  zetarisDownLong: "Zetaris unreachable · checks use offline captures",
  nightshiftDown: "Nightshift unreachable",
  nightshiftAuth: "Nightshift: not authorised",
  apiDown: "API unreachable",
  checking: "Checking services",
  visionUnavailable: "Vision lane unavailable: letters read from the text layer",
  popoverTitle: "Services",
  lane: { fast: "Lightning", deep: "Ultra" },
  laneHeads: ["Lane", "Requested", "Answered", "Nemotron"],
} as const;

export const QUEUE = {
  crumb: "Change requests",
  title: "Change requests",
  sub: "Bank and remit-to changes waiting for a decision before the next payment run.",
  tagline: "Before the money moves, prove who is asking.",
  tabs: { review: "To review", decided: "Decided", all: "All" },
  columns: { received: "Received", from: "From", change: "Change", run: "Payment run", status: "Status", action: "" },
  nextRun: "Next run",
  verify: "Verify",
  verifyAgain: "Verify again",
  open: "Open",
  starting: "Starting…",
  demoChip: "Demo · synthetic",
  emptyReview: { title: "Nothing waiting.", body: "Upload a letter or type a company's details to check it." },
  emptyDecided: { title: "No decisions yet.", body: "Verify a request to see it here." },
  loadFailed: "Couldn't load requests.",
  zetarisDownConfirm: "Zetaris is down. This check will use offline captures and cannot approve.",
  zetarisDownBlocked: (host: string) =>
    `Zetaris is not reachable at ${host}. Live checks are unavailable. Start Zetaris, or restart Probity with SAMPLE_MODE=true.`,
  startFailed: (msg: string) => `Couldn't start the check: ${msg}`,
  uploadExpired: "Upload expired; upload again",
  checking: (step: string) => `Checking… ${step}`,
  rowLabel: (name: string) => `${name}`,
} as const;

export const ERRORS = {
  apiDown: (base: string) => `Probity API did not answer at ${base}. Start it with \`docker compose up\`, then try again.`,
  apiDownTail: (head: string) => `${head} Start it with \`docker compose up\`, then try again.`,
  tryAgain: "Try again",
  retry: "Retry",
  unavailable: "Unavailable",
  parse: "The response did not match the expected shape.",
  busy: (secs: number | null) =>
    secs ? `Probity is busy with other checks. Try again in ${secs} s.` : "Probity is busy with other checks. Try again shortly.",
  notFoundRun: (id: string) => `No check with id ${id}.`,
  backToRequests: "Back to change requests",
  generic: (msg: string) => `Couldn't complete that: ${msg}`,
  pageTitle: "Something went wrong.",
} as const;

export const NEW = {
  crumb: "New request",
  title: "New request",
  sub: "Start a check from a letter or from typed details.",
  tabs: { upload: "Upload documents", typed: "Type the details" },
  letterLabel: "Letter (PNG or PDF, up to 4 pages, 8 MB)",
  dropText: "Drop the letter here or choose a file",
  dropTextEml: "Drop the email headers here or choose a file",
  choose: "Choose file",
  emlLabel: "Email headers (.eml, optional)",
  emlHelp: "Lets Probity check the sender and reply-to domains.",
  paymentRun: "Payment run",
  paymentRunAuto: "Automatic (earliest run with this vendor's items)",
  receivedAt: "Received at (UTC)",
  nameLabel: "Company legal name",
  ueiLabel: "or Federal award ID (UEI)",
  ueiHelp: "12 capital letters and digits, for example JCBMLGPE6Z71.",
  try: "Try:",
  claimsGroup: "What the request claims (optional)",
  addrLine1: "New remit-to address",
  addrUnit: "Suite or floor",
  addrCity: "City",
  addrState: "State",
  addrZip: "ZIP",
  routing: "New bank routing number",
  account: "New account number",
  accountHelp: "Test numbers only: routing 110000000, accounts 000999000 followed by 3 digits.",
  senderEmail: "Sender email",
  phone: "Phone on the request",
  typedNotice: "Typed details are not a document, so the decision is at most Call back first.",
  demoNotice:
    "Demo only. Use the synthetic letters in input_examples/ or your own test documents. Use public company names only. Do not upload real vendor letters, real bank details or personal data. Letter text is sent to NVIDIA's hosted Nemotron API through Meterless Nightshift.",
  advanced: "Advanced",
  outageLabel: "Simulate a USAspending outage (test hook)",
  outageHelp: "Every result from this check is labelled as a simulated outage.",
  verify: "Verify",
  cancel: "Cancel",
  starting: "Starting…",
  examplesTitle: "Demo inputs",
  examplesBody: "Synthetic requests shipped with Probity. Typed examples fill the form; documents are checked from the inbox.",
  helpTitle: "What Probity reads",
  helpBody: "The letter's quoted claims, the sender's email headers and the payment run. Every claim is then checked against independent sources.",
  errorSummary: "Fix the highlighted fields to continue.",
  v: {
    noLetter: "Add the letter to check.",
    wrongType: "This file is not a PNG or PDF.",
    tooBig: "This file is larger than 8 MB.",
    pdfPages: "PDFs over 4 pages are not supported.",
    emlFrom: "This doesn't look like email headers. Expected a From: line.",
    nameOrUei: "Enter a company name or a UEI.",
    uei: "A UEI is 12 capital letters and digits.",
    routing: "Routing numbers have 9 digits.",
    account: "Use a test account number: 000999000 followed by 3 digits.",
    state: "Use the 2-letter state code.",
    email: "Enter an email address like ap@vendor.example.",
  },
} as const;

export const TOASTS = {
  scriptCopied: "Script copied",
  copied: "Copied",
  callbackSaved: (id: string) => `Call-back saved. Re-checking ${id}…`,
  callbackNoAnswer: "Logged: no answer. The request stays at Call back first.",
  callbackFailed: (msg: string) => `Couldn't save the call-back: ${msg}`,
  outcomeImpersonation: "Outcome recorded. Future requests that reuse these details will be held.",
  outcomeLegit: "Outcome recorded.",
  noteSaved: "Note saved to memory (H-MEM). It will be recalled on the next check for this vendor.",
  stopped: "Stopping the check…",
  started: (id: string) => `Check started for ${id}.`,
} as const;

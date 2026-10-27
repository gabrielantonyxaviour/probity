// Landing copy, part 2 (what a check leaves behind, cases, run it, check our work, CTA, footer).
import { CITATIONS } from "./citations";

export const LEAVES = {
  heading: "What every check leaves behind",
  groups: [
    {
      name: "Evidence",
      items: [
        { icon: "Table2", title: "Fact sheet", body: "Eight facts, four sources, one result per row", to: "run" },
        { icon: "Database", title: "Zetaris queries", body: "The SQL, its hash and the rows it returned", to: "evidence" },
        { icon: "RotateCcw", title: "Re-run", body: "Run any cited query again and compare row hashes", to: "evidence" },
      ],
    },
    {
      name: "Reasoning",
      items: [
        { icon: "ListTree", title: "Agent trace", body: "Who challenged whom, round by round", to: "trace" },
        { icon: "Network", title: "Entity graph", body: "The vendor’s corporate family, with every conflicting link marked", to: "graph" },
        { icon: "Receipt", title: "Model receipts", body: "Which Nemotron model answered each call, with latency and tokens", to: "trace" },
      ],
    },
    {
      name: "Record",
      items: [
        { icon: "FileText", title: "Decision dossier", body: "A printable record with sign-off lines", to: "dossier" },
        { icon: "Phone", title: "Call-back script", body: "The number to call, and the numbers not to use", to: "run" },
        { icon: "ScanSearch", title: "Run sweep", body: "Other items in the same payment run that fail payment controls", to: "run" },
      ],
    },
  ],
} as const;

export const CASES = {
  heading: "Modelled on real payment diversions",
  link: "ALL SOURCES →",
  lede: "Business email compromise caused $3,046,598,558 in reported losses in 2025, by the FBI’s count.",
  ledeMuted: "63% of organisations that reported email-based payment attacks saw third parties request a change of bank account or payment instructions (AFP, 2025).",
  cards: [
    {
      figure: "$23.5M", eyebrow: "2018 · DEFENSE FUEL CONTRACT",
      title: "Stolen logins changed a fuel supplier’s bank details on a government vendor payment system. The payment went to a used-car dealer.",
      cites: [CITATIONS.usao, CITATIONS.gao],
    },
    {
      figure: "$1.52M", eyebrow: "2025 · CITY ACCOUNTS PAYABLE",
      title: "AP approved a vendor-contact change without calling the vendor, then accepted a fake voided check. Two transfers followed.",
      cites: [CITATIONS.baltimore],
    },
    {
      figure: "$445,946", eyebrow: "2023–24 · TOWN BUILDING PROJECT",
      title: "Impostors on a genuine-looking domain moved a known vendor to EFT. Four monthly payments went out before anyone noticed.",
      cites: [CITATIONS.arlington],
    },
  ],
  note: "Demo requests and internal records are synthetic, modelled on these public cases. Registry facts are real public data. Nacha’s monitoring rule (phase 1 from 20 Mar 2026) names vendor impersonation under ‘False Pretenses’.",
} as const;

export const RUN = {
  heading: "Run it on your own vendor",
  lede: "Name any US federal awardee and Probity runs the same check from the CLI or the API.",
  ledeMuted: "With no keys, SAMPLE_MODE replays captured data through the same policy code.",
  checks: [
    { title: "Same policy code in sample and live", body: "An offline run never approves a payment change." },
    { title: "Every fact carries a Zetaris query id", body: "Re-run it and compare row hashes." },
    { title: "Agents never write SQL", body: "They choose allow-listed templates with typed parameters." },
  ],
  primary: "SEE A LIVE CHECK →",
  secondary: "READ THE README",
  cli: 'probity run --name "Parsons Corporation"',
  missing: "RUN THE CHECK TO SEE THIS",
} as const;

export const CHECK = {
  heading: "Check our work",
  lede: "Everything a judge or an auditor needs is one click away.",
  cards: [
    { key: "demo", title: "Live demo", body: "The queue of demo change requests.", icon: "ArrowUpRight" },
    { key: "code", title: "Source code", body: "The policy, the query templates and the tests.", icon: "ArrowUpRight" },
    { key: "dossier", title: "Sample dossier", body: "A decision record you can print and sign.", icon: "ArrowRight" },
    { key: "limits", title: "Sources and limits", body: "What Probity reads, what it never does, and how fresh each source is.", icon: "ArrowRight" },
  ],
} as const;

export const CTA = { heading: "Call the number on file, not the number in the letter.", pill: "SEE A LIVE CHECK →" } as const;

export const FOOTER = {
  legal: "Probity is a project for the Open Agent Hackathon 2026, Track 01, by team Zen.",
  synthetic: "Demo requests and internal records are synthetic. Registry facts are real public data.",
  policy: "POLICY PP-2026-10-27.1",
  left: "© 2026 team Zen",
  right: "Requests and internal records are synthetic. Registry facts are real public data from USAspending and SEC EDGAR.",
} as const;

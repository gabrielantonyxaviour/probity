// One request-bearing example (scenario or everyday inbox item): a Letter, optional headers, and the triage facts around it.
import type { EmlSpec } from "./eml";
import type { Letter } from "./model";

export type Channel = "email" | "vendor_portal" | "mail";
export interface ExampleDoc {
  folder: string; // repo-relative output folder
  exampleId: string;
  requestId: string;
  letter: Letter;
  scan?: boolean; // image-only degraded PDF
  eml?: EmlSpec; // absent for mail and portal items
  channel: Channel;
  receivedAt: string;
  paymentRunId: string;
  title: string;
  scenario: string | null;
  kinds: ("bank" | "remit")[];
  manifestName: string; // claimed_name in the inbox manifest
  from: string;
  subject: string;
  unmarked?: boolean; // fictional vendor: letter and email carry no synthetic label (decision 8)
  emailInjections?: { id: string; text: string; goal: string }[]; // attack text placed in the email body (D6)
  truthPath?: string; // override of tests/fixtures/docs/<id>.truth.json
}

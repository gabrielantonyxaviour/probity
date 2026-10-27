// Everyday requests 0429-0443 (the newest four, so the queue is busy on the morning of 27 October).
import type { InboxSpec } from "./inbox-build";
import { marks } from "./inbox-build";
import { BANKS, SANS, SERIF, SERIF_HEAD } from "./common";

export const INBOX_2: InboxSpec[] = [
  {
    no: "0429", slug: "ostrander-bank-change", vendorId: "V-10471", received: "2026-10-26T13:20:00Z", channel: "email", kinds: ["bank"],
    face: SANS, align: "left", rule: true, date: "October 26, 2026", subject: "Updated ACH instructions", salutation: "Dear Accounts Payable,",
    closing: "Sincerely,", signer: "D. Whitcombe", title: "Controller", effectiveIso: "2026-10-30", account: "000999000904", bank: BANKS.oldQuarry,
    fromLocal: "ar", scenarioTitle: "Ostrander Test & Calibration ACH update",
    body: ({ v, item }) => ({ paras: [
      { text: `${v.plainName} is consolidating its bank accounts at the end of the quarter. Payments for ${item?.invoice ?? "open invoices"} and all later invoices should go to the account below.`, marks: [{ text: v.plainName, field: "claimed_name" }, ...(item ? [marks.ref(item.invoice)] : [])] },
      { text: "Our calibration certificates and remit-to address are unchanged.", after: 4 },
    ] }),
    emlBody: ["Hello,", "Our new ACH instructions are attached.", "Sincerely,", "D. Whitcombe"], ip: "198.51.100.31",
  },
  {
    no: "0434", slug: "bellhaven-bank-remit-change", vendorId: "V-10718", received: "2026-10-26T20:41:00Z", channel: "mail", kinds: ["bank", "remit"],
    face: SERIF_HEAD, align: "left", rule: true, date: "October 21, 2026", subject: "New bank and mailing address for payments", salutation: "To the Accounts Payable Department:",
    closing: "Yours truly,", signer: "A. Lindqvist", title: "Business Manager", effectiveIso: "2026-11-02", account: "000999000905", bank: BANKS.harborline,
    newRemit: () => "7 Cooperage Row, Suite B, Sterling, VA 20166", scenarioTitle: "Bellhaven Print & Mail bank and address change, mailed letter",
    body: ({ v, item }) => ({ paras: [
      { text: `${v.plainName} has changed both its bank and its mailing address. Please apply the details below to ${item?.invoice ?? "our open invoices"} and to everything we bill after 2 November 2026.`, marks: [{ text: v.plainName, field: "claimed_name" }, { text: "after 2 November 2026", field: "effective_date", nobreak: true }, ...(item ? [marks.ref(item.invoice)] : [])] },
      { text: "Paper cheques should no longer be mailed to the old address.", after: 4 },
    ] }),
    emlBody: [], ip: "192.0.2.64",
  },
  {
    no: "0439", slug: "merriwether-bank-change", vendorId: "V-10630", received: "2026-10-27T06:12:00Z", channel: "email", kinds: ["bank"],
    face: SANS, align: "center", rule: false, headSize: 20, date: "October 26, 2026", subject: "Bank account update for our subscriptions", salutation: "Hello Accounts Payable team,",
    closing: "Thank you,", signer: "P. Oyelaran", title: "Accounts Receivable", effectiveIso: "2026-11-03", account: "000999000906", bank: BANKS.calderwick,
    fromName: "Dana Whitcombe", fromLocal: "billing", scenarioTitle: "Merriwether Cloud Reseller bank update, sent from a shared billing mailbox",
    body: ({ v, item }) => ({ paras: [
      { text: `${v.plainName} has opened a new collections account. From 3 November 2026 please pay ${item?.invoice ?? "our invoices"} and all renewals to the account below.`, marks: [{ text: v.plainName, field: "claimed_name" }, { text: "From 3 November 2026", field: "effective_date", nobreak: true }, ...(item ? [marks.ref(item.invoice)] : [])] },
      { text: "Reply to this message if you need a copy of our W-9.", after: 4 },
    ] }),
    emlBody: ["Hello,", "The letter with our new bank details is attached.", "Thank you,", "Billing team"], ip: "203.0.113.120",
  },
  {
    no: "0443", slug: "harrow-vale-remit-change", vendorId: "V-10776", received: "2026-10-27T06:48:00Z", channel: "vendor_portal", kinds: ["remit"],
    face: SERIF, align: "right", rule: false, date: "October 26, 2026", subject: "Lockbox for remittances", salutation: "Dear Accounts Payable,",
    closing: "Regards,", signer: "E. Nakagawa-Stein", title: "Office Administrator", effectiveIso: "2026-11-01",
    newRemit: () => "PO Box 7731, Washington, DC 20044", fromLocal: "ap", scenarioTitle: "Harrow & Vale lockbox address via the vendor portal",
    body: ({ v }) => ({ paras: [
      { text: `${v.plainName} now receives payments through a lockbox. Please send all remittances from 1 November 2026 to the box below.`, marks: [{ text: v.plainName, field: "claimed_name" }, { text: "from 1 November 2026", field: "effective_date", nobreak: true }] },
      { text: "Our bank details are unchanged.", after: 4 },
    ] }),
    emlBody: [], ip: "192.0.2.99",
  },
];

// Everyday requests 0401-0425. Plain, varied business letters: different letterheads, voices and titles. Not every one is clean.
import type { InboxSpec } from "./inbox-build";
import { marks, address } from "./inbox-build";
import { BANKS, SANS, SERIF, SERIF_HEAD } from "./common";

export const INBOX_1: InboxSpec[] = [
  {
    no: "0401", slug: "kettle-point-remit-change", vendorId: "V-10357", received: "2026-10-21T14:20:00Z", channel: "mail", kinds: ["remit"],
    face: SERIF, align: "center", rule: true, date: "October 16, 2026", subject: "We have moved our office", salutation: "To whom it may concern,",
    closing: "With thanks,", signer: "C. Brandvold (fictional)", title: "Owner", effectiveIso: "2026-11-02",
    newRemit: () => "11 Hollis Quarry Rd, Stafford, VA 22554", scenarioTitle: "Kettle Point office move, mailed letter",
    body: ({ v }) => ({ paras: [
      { text: `After eleven years on ${v.remit.line1} we have outgrown the space, and ${v.plainName} has moved its office and warehouse to a larger building.`, marks: [{ text: v.plainName, field: "claimed_name" }] },
      { text: "Effective 2 November 2026, please direct all remittances to the address below. Our telephone number and our bank details are unchanged, so nothing else needs to be updated.", marks: [{ text: "Effective 2 November 2026", field: "effective_date", nobreak: true }] },
      { text: "Thank you for being a customer through the move; our crews are on site as usual.", after: 4 },
    ] }),
    emlBody: [], ip: "192.0.2.10",
  },
  {
    no: "0405", slug: "juniper-lane-bank-change", vendorId: "V-10544", received: "2026-10-21T18:44:00Z", channel: "vendor_portal", kinds: ["bank"],
    face: SANS, align: "right", rule: false, date: "October 21, 2026", subject: "ACH details for Juniper Lane Travel Management", salutation: "Hello Accounts Payable,",
    closing: "Best regards,", signer: "T. Ellsworth (fictional)", title: "Controller", effectiveIso: "2026-11-01", account: "000999000900", bank: BANKS.harborline,
    fromLocal: "billing", headerOnFile: true, scenarioTitle: "Juniper Lane bank change via the vendor portal",
    body: ({ v }) => ({ paras: [
      { text: `${v.plainName} is moving its operating account to a new bank. Please use the account below for all ACH payments from 1 November 2026.`, marks: [{ text: "from 1 November 2026", field: "effective_date", nobreak: true }, { text: v.plainName, field: "claimed_name" }] },
      { text: "We have also submitted this change through your vendor portal, where it shows as awaiting review. Please call the main number on your vendor file if you would like to confirm it.", after: 4 },
    ] }),
    emlBody: [], ip: "192.0.2.11",
  },
  {
    no: "0409", slug: "pembrook-bank-remit-change", vendorId: "V-10402", received: "2026-10-22T13:05:00Z", channel: "email", kinds: ["bank", "remit"],
    face: SANS, align: "left", rule: true, date: "October 21, 2026", subject: "Billing consolidation: new remit-to and bank account", salutation: "Dear Accounts Payable,",
    closing: "Sincerely,", signer: "M. Prakash (fictional)", title: "Billing Manager", effectiveIso: "2026-11-01", account: "000999000901", bank: BANKS.calderwick,
    newRemit: () => "PO Box 2210, Manassas, VA 20108", fromLocal: "ar", replyTo: "ar.desk@payablehub.example", scenarioTitle: "Pembrook billing consolidation, replies from a shared desk",
    body: ({ v }) => ({ paras: [
      { text: `From the November cycle, ${v.plainName} is consolidating receivables with a shared billing group. Remittances should go to the lockbox below, and payments by ACH to the new account.`, marks: [{ text: v.plainName, field: "claimed_name" }, { text: "From the November cycle", field: "effective_date", nobreak: true }] },
      { text: "Please note that replies on this subject will come from our billing desk rather than from this mailbox.", after: 4 },
    ] }),
    emlBody: ["Hello,", "Please see the attached letter about our billing consolidation.", "Regards,", "M. Prakash (fictional)"], ip: "198.51.100.14",
  },
  {
    no: "0414", slug: "chesterfield-bank-change", vendorId: "V-10349", received: "2026-10-22T19:30:00Z", channel: "email", kinds: ["bank"],
    face: SERIF_HEAD, align: "left", rule: true, date: "October 22, 2026", subject: "Change of bank account", salutation: "Dear Accounts Payable team,",
    closing: "Respectfully,", signer: "H. Ostergaard (fictional)", title: "Director of Finance", effectiveIso: "2026-10-30", account: "000999000902", bank: BANKS.oldQuarry,
    phoneNpa: "804", fromLocal: "accounts", scenarioTitle: "Chesterfield Ridge bank change with a new contact number",
    body: ({ v, item }) => ({ paras: [
      { text: `Our bank has migrated our operating accounts. Please remit ${item?.invoice ?? "all open invoices"} and every future invoice from ${v.plainName} to the account below.`, marks: [...(item ? [marks.ref(item.invoice)] : []), { text: v.plainName, field: "claimed_name" }] },
      { text: "Our accounts receivable line has also changed; the number above is the one to use for any questions about this request.", after: 4 },
    ] }),
    emlBody: ["Hello,", "Our updated bank details are in the attached letter.", "Regards,", "H. Ostergaard (fictional)"], ip: "203.0.113.90",
  },
  {
    no: "0420", slug: "corbin-hollow-bank-change", vendorId: "V-10528", received: "2026-10-24T15:15:00Z", channel: "email", kinds: ["bank"],
    face: SANS, align: "left", rule: false, date: "October 23, 2026", subject: "Bank account change, please action before Friday", salutation: "Hi Accounts Payable,",
    closing: "Thanks,", signer: "B. Quillfeather (fictional)", title: "Accounts Receivable", effectiveIso: "2026-10-30", account: "000999000903", bank: BANKS.calderwick,
    lookalike: true, fromLocal: "ar", scenarioTitle: "Corbin Hollow bank change from a lookalike address",
    body: ({ v, item }) => ({ paras: [
      { text: `Our current account is being closed, so please update ${v.plainName} to the account below${item ? ` for ${item.invoice}` : ""} and all later payments.`, marks: [{ text: v.plainName, field: "claimed_name" }, ...(item ? [marks.ref(item.invoice)] : [])] },
      { text: "Please make this change before Friday, otherwise the payment will be returned.", marks: [{ text: "Please make this change before Friday", field: "pressure_phrase", kind: "urgency", nobreak: true }], after: 4 },
    ] }),
    emlBody: ["Hi,", "Bank details attached. Please action before Friday.", "Thanks,", "B. Quillfeather (fictional)"], ip: "198.51.100.88",
  },
  {
    no: "0425", slug: "granite-shoals-remit-change", vendorId: "V-10688", received: "2026-10-25T14:02:00Z", channel: "email", kinds: ["remit"],
    face: SERIF, align: "left", rule: true, date: "October 23, 2026", subject: "New suite number for remittances", salutation: "Dear Accounts Payable team,",
    closing: "Kind regards,", signer: "J. Okeke-Ruiz (fictional)", title: "Office Manager", effectiveIso: "2026-11-01",
    newRemit: (v) => address({ ...v.remit, unit: "Suite 410" }), fromLocal: "ap", scenarioTitle: "Granite Shoals new suite, same building",
    body: ({ v }) => ({ paras: [
      { text: `${v.plainName} has moved to a larger suite in the same building. Please use Suite 410 on all remittances from 1 November 2026.`, marks: [{ text: v.plainName, field: "claimed_name" }, { text: "from 1 November 2026", field: "effective_date", nobreak: true }] },
      { text: "The street address, our telephone number and our bank details are unchanged.", after: 4 },
    ] }),
    emlBody: ["Hello,", "A short letter about our new suite number is attached.", "Kind regards,", "J. Okeke-Ruiz (fictional)"], ip: "192.0.2.52",
  },
];

// RFC 5322 headers for headers.eml: CRLF line ends, RFC 5737 documentation IPs, X-Synthetic-Notice and a labelled first body line.
import { sha256Hex, COMPANY } from "../contracts";

export interface EmlSpec {
  fromName: string | null;
  from: string;
  replyTo?: string;
  subject: string;
  utc: string; // ISO UTC; also what the manifest calls received_at
  senderHost?: string; // undefined: mail.<from domain>; "" : no hostname, bracketed IP only
  senderIp: string; // RFC 5737 only
  auth: { spf: "pass" | "softfail"; dkim: "pass" | "none"; dmarc: "pass" | "fail" };
  body: string[];
  company: string;
}
export const domainOf = (addr: string): string => addr.slice(addr.indexOf("@") + 1).toLowerCase();
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number): string => String(n).padStart(2, "0");

/** RFC 5322 date in US Eastern time (EDT, -0400, until 1 Nov 2026). */
export function rfcDateEt(utc: string, plusSeconds = 0): string {
  const d = new Date(Date.parse(utc) + plusSeconds * 1000 - 4 * 3_600_000);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} -0400`;
}
const fold = (header: string): string => {
  if (header.length <= 76) return header;
  const parts = header.split("; ");
  return parts.map((p, i) => (i === 0 ? p : `\t${p}`)).join(";\r\n");
};

export function buildEml(e: EmlSpec): string {
  const d = domainOf(e.from);
  const host = e.senderHost === undefined ? `mail.${d}` : e.senderHost;
  const idTag = sha256Hex(`${e.from}|${e.utc}|${e.subject}`);
  const received = [
    host === ""
      ? `Received: from [${e.senderIp}] by mx1.halvorsen-ms.example (Postfix) with ESMTP id ${idTag.slice(0, 10).toUpperCase()}; ${rfcDateEt(e.utc, 2)}`
      : `Received: from ${host} (${host} [${e.senderIp}]) by mx1.halvorsen-ms.example (Postfix) with ESMTPS id ${idTag.slice(0, 10).toUpperCase()}; ${rfcDateEt(e.utc, 2)}`,
    host === "" ? `Received: from [${e.senderIp}] by ${d} with SMTP; ${rfcDateEt(e.utc)}` : `Received: from [${e.senderIp}] (helo ${host}) by ${host} with SMTP; ${rfcDateEt(e.utc)}`,
  ];
  const addr = e.fromName ? `"${e.fromName}" <${e.from}>` : e.from;
  const headers = [
    `Return-Path: <${e.from}>`, ...received,
    fold(`Authentication-Results: mx1.halvorsen-ms.example; spf=${e.auth.spf} smtp.mailfrom=${d}; dkim=${e.auth.dkim}${e.auth.dkim === "pass" ? ` header.d=${d}` : ""}; dmarc=${e.auth.dmarc} header.from=${d}`),
    `From: ${addr}`, ...(e.replyTo ? [`Reply-To: ${e.replyTo}`] : []),
    `To: ${COMPANY.ap_mailbox}`, `Subject: ${e.subject}`, `Date: ${rfcDateEt(e.utc)}`,
    `Message-ID: <${idTag.slice(10, 24)}.${idTag.slice(24, 30).toUpperCase()}@${host === "" ? d : host}>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 7bit",
    `X-Synthetic-Notice: SYNTHETIC SAMPLE: not sent by ${e.company}`,
  ];
  return `${[...headers, "", "[SYNTHETIC SAMPLE - not a real email]", ...e.body, ""].join("\r\n")}`;
}

export interface ParsedEml { from: string | null; replyTo: string | null; date: string | null }
export function parseEml(text: string): ParsedEml {
  const head = text.split(/\r\n\r\n/)[0] ?? "";
  const unfolded = head.replace(/\r\n[ \t]+/g, " ");
  const get = (name: string): string | null => new RegExp(`^${name}:\\s*(.*)$`, "im").exec(unfolded)?.[1]?.trim() ?? null;
  const addr = (v: string | null): string | null => (v ? (/<([^>]+)>/.exec(v)?.[1] ?? v).trim() : null);
  return { from: addr(get("From")), replyTo: addr(get("Reply-To")), date: get("Date") };
}

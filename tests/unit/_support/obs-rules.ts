// TEST SUPPORT. Observation rules per 03 §7.6 as the Zetaris lane publishes them (the real module owns production rules).
import type { ObservationRule } from "../../../app/components/template-kit.port";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const nn = (v: unknown): boolean => s(v) !== "";
const join = (...v: unknown[]): string => v.map(s).filter(Boolean).join(", ");
const r = (field: ObservationRule["field"], fieldcode: ObservationRule["fieldcode"], source: ObservationRule["source"], value: (x: Row) => string | null, row_key: (x: Row) => string, when?: (x: Row) => boolean): ObservationRule =>
  ({ field, fieldcode, source, value, row_key, ...(when ? { when } : {}) });

export const OBS: Record<string, ObservationRule[]> = {
  T01: [
    r("legal_name", "ln", "vendor_master", (x) => s(x.legal_name), (x) => s(x.vendor_id)),
    r("remit_address", "ra", "vendor_master", (x) => join(x.remit_line1, x.remit_unit, x.remit_city, x.remit_state, x.remit_zip), (x) => s(x.vendor_id)),
    r("sender_domain", "sd", "vendor_master", (x) => s(x.email_domains_on_file), (x) => s(x.vendor_id)),
    r("registrant", "rg", "vendor_master", (x) => s(x.registrant_cik), (x) => s(x.vendor_id), (x) => nn(x.registrant_cik)),
  ],
  T02: [
    r("callback_phone", "cp", "vendor_master", (x) => `${s(x.value)} (${s(x.valid_from).slice(0, 10)} -> ${s(x.valid_to).slice(0, 10) || "open"})`, (x) => s(x.contact_id), (x) => s(x.kind) === "phone"),
    r("sender_domain", "sd", "vendor_master", (x) => s(x.value).split("@").pop() ?? "", (x) => s(x.contact_id), (x) => s(x.kind) === "email"),
  ],
  T03: [r("invoice_refs", "ir", "vendor_master", (x) => `${s(x.invoice_no)} -> ${s(x.vendor_id)}`, (x) => s(x.invoice_no))],
  T04: [r("sender_domain", "sd", "vendor_master", (x) => s(x.email_domains_on_file), (x) => s(x.vendor_id))],
  T04b: [r("legal_name", "ln", "vendor_master", (x) => s(x.legal_name), (x) => s(x.vendor_id))],
  T05: [
    r("legal_name", "ln", "vendor_master", (x) => s(x.vm_name), (x) => s(x.vendor_id), (x) => nn(x.vm_name)),
    r("legal_name", "ln", "usaspending", (x) => s(x.usa_name), (x) => s(x.entity_key), (x) => nn(x.usa_name)),
    r("legal_name", "ln", "edgar", (x) => s(x.sec_name), (x) => s(x.cik), (x) => nn(x.sec_name)),
    r("remit_address", "ra", "vendor_master", (x) => join(x.remit_line1, x.remit_city, x.remit_state), (x) => s(x.vendor_id), (x) => nn(x.remit_line1)),
    r("remit_address", "ra", "usaspending", (x) => join(x.usa_line1, x.usa_city, x.usa_state), (x) => s(x.entity_key), (x) => nn(x.usa_line1)),
    r("remit_address", "ra", "edgar", (x) => join(x.biz_street1, x.biz_city, x.biz_state), (x) => s(x.cik), (x) => nn(x.biz_street1)),
    r("callback_phone", "cp", "edgar", (x) => s(x.sec_phone), (x) => s(x.cik), (x) => nn(x.sec_phone)),
    r("parent", "pa", "usaspending", (x) => s(x.parent_uei), (x) => s(x.entity_key), (x) => nn(x.parent_uei)),
    r("registrant", "rg", "edgar", (x) => `${s(x.cik)} ${s(x.sec_name)}`, (x) => s(x.cik), (x) => nn(x.cik)),
  ],
  T05b: [
    r("parent", "pa", "usaspending", (x) => `${s(x.p_entity_key)} ${s(x.p_legal_name)}`, (x) => s(x.p_entity_key)),
    r("remit_address", "ra", "usaspending", (x) => join(x.p_address_line1, x.p_city_name, x.p_state_code, x.p_zip), (x) => s(x.p_entity_key)),
  ],
  T06a: [r("legal_name", "ln", "usaspending", (x) => s(x.name), (x) => s(x.key))],
  T06b: [r("legal_name", "ln", "usaspending", (x) => s(x.name), (x) => s(x.key))],
  T06c: [r("legal_name", "ln", "edgar", (x) => s(x.name), (x) => s(x.key))],
  T07: [r("bank_account", "ba", "vendor_master", (x) => `${s(x.via)} ${s(x.owner_vendor_id)} ${s(x.status)} ${s(x.at_ts)}`, (x) => s(x.bank_account_id) || s(x.request_id))],
  T08: [r("callback_phone", "cp", "vendor_master", (x) => `${s(x.phone_e164)} ${s(x.phone_source)} ${s(x.outcome)} ${s(x.called_at)} ${s(x.called_by)}`, (x) => s(x.log_id))],
  T08b: [r("bank_account", "ba", "request", (x) => `${s(x.new_routing)} ${s(x.routing_check)}`, (x) => s(x.request_id))],
  T10: [r("parent", "pa", "usaspending", (x) => `${s(x.child_uei)} ${s(x.state_province)}`, (x) => s(x.child_uei) || s(x.child_recipient_id))],
  T11: [r("remit_address", "ra", "usaspending", (x) => `${join(x.address_line1, x.city_name, x.state_code, x.zip)} ${s(x.matched_uei)} ${s(x.vendor_id_on_file)}`, (x) => s(x.row_key))],
  T16: [r("registrant", "rg", "edgar", (x) => `${s(x.cik)} ${s(x.title)}`, (x) => s(x.cik))],
};
export const EMPTY: ObservationRule[] = [];

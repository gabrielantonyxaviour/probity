// TEST SUPPORT. Row data for the demo scenarios as Zetaris would return it (shapes from 03 §5.4, §7.2). Synthetic ERP rows are
// labelled fictional exactly as the seed does. These feed fake ports in unit tests only: no product code reads this file.
import { accountHash } from "../../../app/policy/normalise";

type Row = Record<string, unknown>;
export const S1_HASH = accountHash("110000000", "000999000141");

export const VENDORS: Record<string, Row> = {
  "V-10027": { vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", name_norm: "BOOZ ALLEN HAMILTON INC", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646", remit_line1: "8283 Greensboro Dr", remit_unit: null, remit_city: "McLean", remit_state: "VA", remit_zip: "22102", status: "active", created_at: "2019-04-02 00:00:00", email_domains_on_file: "boozallen.example" },
  "V-10442": { vendor_id: "V-10442", legal_name: "Leidos, Inc.", name_norm: "LEIDOS INC", uei: "UE9QJD4KK1L6", registrant_cik: "0001336920", remit_line1: "11951 Freedom Dr", remit_unit: null, remit_city: "Reston", remit_state: "VA", remit_zip: "20190", status: "active", created_at: "2018-01-10 00:00:00", email_domains_on_file: "leidos.example" },
  "V-10587": { vendor_id: "V-10587", legal_name: "Science Applications International Corp", name_norm: "SCIENCE APPLICATIONS INTERNATIONAL CORP", uei: "MMLKPW9JLX64", registrant_cik: "0001571123", remit_line1: "12010 Sunset Hills Rd", remit_unit: null, remit_city: "Reston", remit_state: "VA", remit_zip: "20190", status: "active", created_at: "2018-02-10 00:00:00", email_domains_on_file: "saic.example" },
  "V-10198": { vendor_id: "V-10198", legal_name: "L3Harris Technologies, Inc.", name_norm: "L3HARRIS TECHNOLOGIES INC", uei: "QM4EZDV15JL8", registrant_cik: "0000202058", remit_line1: "1395 Troutman Blvd NE", remit_unit: null, remit_city: "Palm Bay", remit_state: "FL", remit_zip: "32905", status: "active", created_at: "2017-05-01 00:00:00", email_domains_on_file: "l3harris.example" },
};

export const T02: Record<string, Row[]> = {
  "V-10027": [
    { contact_id: "VC-00001", kind: "phone", value: "(703) 902-5000", valid_from: "2019-04-02 00:00:00", valid_to: "2026-10-19 00:00:00", changed_via: "onboarding" },
    { contact_id: "VC-00002", kind: "phone", value: "(703) 555-0182", valid_from: "2026-10-19 00:00:00", valid_to: null, changed_via: "email request" },
  ],
  "V-10198": [{ contact_id: "VC-00040", kind: "phone", value: "(321) 727-9100", valid_from: "2017-05-01 00:00:00", valid_to: null, changed_via: "onboarding" }],
  "V-10442": [{ contact_id: "VC-00050", kind: "phone", value: "(571) 526-6000", valid_from: "2018-01-10 00:00:00", valid_to: null, changed_via: "onboarding" }],
  "V-10587": [{ contact_id: "VC-00060", kind: "phone", value: "(703) 676-4300", valid_from: "2018-02-10 00:00:00", valid_to: null, changed_via: "onboarding" }],
};

export const T05: Record<string, Row> = {
  "V-10027": { vendor_id: "V-10027", vm_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646", remit_line1: "8283 Greensboro Dr", remit_city: "McLean", remit_state: "VA", email_domains_on_file: "boozallen.example", entity_key: "JCBMLGPE6Z71-C", usa_name: "BOOZ ALLEN HAMILTON INC", parent_uei: "MBPHTU7Y9S65", usa_line1: "8283 GREENSBORO DR", usa_city: "MCLEAN", usa_state: "VA", cik: "0001443646", sec_name: "Booz Allen Hamilton Holding Corp", sec_phone: "703-902-5000", sec_ein: "000000000", biz_street1: "8283 Greensboro Dr", biz_city: "McLean", biz_state: "VA" },
  "V-10198": { vendor_id: "V-10198", vm_name: "L3Harris Technologies, Inc.", uei: "QM4EZDV15JL8", registrant_cik: "0000202058", remit_line1: "1395 Troutman Blvd NE", remit_city: "Palm Bay", remit_state: "FL", email_domains_on_file: "l3harris.example", entity_key: "QM4EZDV15JL8-C", usa_name: "L3HARRIS TECHNOLOGIES, INC.", parent_uei: "SJULQDJ8NZU7", usa_line1: "1395 TROUTMAN BLVD NE", usa_city: "PALM BAY", usa_state: "FL", cik: "0000202058", sec_name: "L3Harris Technologies, Inc.", sec_phone: "3217279100", sec_ein: "340276860", biz_street1: "1025 W Nasa Blvd", biz_city: "Melbourne", biz_state: "FL" },
};

T05["V-10442"] = { vendor_id: "V-10442", vm_name: "Leidos, Inc.", uei: "UE9QJD4KK1L6", registrant_cik: "0001336920", remit_line1: "11951 Freedom Dr", remit_city: "Reston", remit_state: "VA", email_domains_on_file: "leidos.example", entity_key: "UE9QJD4KK1L6-C", usa_name: "LEIDOS, INC.", parent_uei: "MDSWM6MB1BH7", usa_line1: "11951 FREEDOM DR", usa_city: "RESTON", usa_state: "VA", cik: "0001336920", sec_name: "Leidos Holdings, Inc.", sec_phone: "571-526-6000", sec_ein: "208141406", biz_street1: "11951 Freedom Dr", biz_city: "Reston", biz_state: "VA" };
T05["V-10587"] = { vendor_id: "V-10587", vm_name: "Science Applications International Corp", uei: "MMLKPW9JLX64", registrant_cik: "0001571123", remit_line1: "12010 Sunset Hills Rd", remit_city: "Reston", remit_state: "VA", email_domains_on_file: "saic.example", entity_key: "MMLKPW9JLX64-C", usa_name: "SCIENCE APPLICATIONS INTERNATIONAL CORPORATION", parent_uei: "RE7WMNV9L719", usa_line1: "12010 SUNSET HILLS RD", usa_city: "RESTON", usa_state: "VA", cik: "0001571123", sec_name: "Science Applications International Corp", sec_phone: "703-676-4300", sec_ein: "562711", biz_street1: "12010 Sunset Hills Rd", biz_city: "Reston", biz_state: "VA" };

export const T05B: Record<string, Row> = {
  MBPHTU7Y9S65: { p_entity_key: "MBPHTU7Y9S65-P", p_legal_name: "BOOZ ALLEN HAMILTON HOLDING CORPORATION", p_address_line1: "8283 GREENSBORO DR", p_city_name: "MCLEAN", p_state_code: "VA", p_zip: "22102" },
  SJULQDJ8NZU7: { p_entity_key: "SJULQDJ8NZU7-P", p_legal_name: "L3HARRIS TECHNOLOGIES, INC.", p_address_line1: "1025 W NASA BLVD", p_city_name: "MELBOURNE", p_state_code: "FL", p_zip: "32919" },
};

export const T07: Record<string, Row[]> = {
  [S1_HASH]: [
    { via: "vendor_bank_account", owner_vendor_id: "V-10812", request_id: null, bank_account_id: "BA-00812", status: "active", at_ts: "2026-10-18 00:00:00", vendor_name: "Quillan Ridge Fleet Services LLC (fictional)" },
  ],
};

const item = (id: string, vendor: string, name: string, inv: string, amt: number, extra: Row = {}): Row => ({
  item_id: id, vendor_id: vendor, vendor_name: name, invoice_no: inv, amount_usd: amt, scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", run_amount_usd: 3_104_920, run_item_count: 14, ...extra,
});
export const RUN_ITEMS: Row[] = [
  item("PRI-1030-0001", "V-10027", "Booz Allen Hamilton Inc", "INV-BAH-20931", 612400),
  item("PRI-1030-0002", "V-10027", "Booz Allen Hamilton Inc", "INV-BAH-20944", 431150),
  item("PRI-1030-0003", "V-10027", "Booz Allen Hamilton Inc", "INV-BAH-20967", 241000),
  item("PRI-1030-0004", "V-10198", "L3Harris Technologies, Inc.", "INV-L3H-30011", 410000),
  item("PRI-1030-0005", "V-10442", "Leidos, Inc.", "INV-LDS-88412", 190000),
  item("PRI-1030-0009", "V-10812", "Quillan Ridge Fleet Services LLC (fictional)", "INV-QRF-00231", 87400),
  item("PRI-1030-0010", "V-10763", "Tidewater Cable & Conduit LLC (fictional)", "INV-TCC-00418", 52300),
  item("PRI-1030-0011", "V-10587", "Science Applications International Corp", "INV-SAI-10002", 64000),
];

const dqRow = (r: Row, extra: Row): Row => ({ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", ...r, ...extra });
export const DQ1_INVALID: Row[] = [
  dqRow(RUN_ITEMS[5]!, { bank_changed_at: "2026-10-18 00:00:00", callback_confirmed_at: null, account_vendor_count: 2 }),
  dqRow(RUN_ITEMS[6]!, { bank_changed_at: "2026-10-16 00:00:00", callback_confirmed_at: "2026-10-16 10:00:00", callback_phone_source: "request_letter", account_vendor_count: 1 }),
  { ...dqRow(RUN_ITEMS[4]!, {}), payment_run_id: "PR-2026-09-15", item_id: "PRI-0915-0004", bank_changed_at: "2026-09-01 00:00:00" },
];
export const DQ2_INVALID: Row[] = [
  dqRow(RUN_ITEMS[5]!, { bank_changed_at: "2026-10-18 00:00:00", account_vendor_count: 2 }),
  { ...dqRow(RUN_ITEMS[4]!, {}), payment_run_id: "PR-2026-08-15", item_id: "PRI-0815-0007", bank_changed_at: "2026-08-01 00:00:00", account_vendor_count: 2 },
];

export const T11_S1: Row = { row_key: "KHK6E1JW9C15-C", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "BOOZ ALLEN HAMILTON INC", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", via: "session.pp_usa_r_khk6e1jw9c15", vendor_id_on_file: null };
export const T10_S1: Row = { child_uei: "KHK6E1JW9C15", child_recipient_id: "x-C", child_name: "BOOZ ALLEN HAMILTON INC", state_province: "NJ", amount: 1000, list_size: 41 };

export const CL_L3: Row = { log_id: "CL-20398", vendor_id: "V-10198", request_id: "BCR-2026-0398", purpose: "bank_change_callback", phone_e164: "+13217279100", phone_source: "edgar_registrant", outcome: "confirmed", called_at: "2026-10-21 14:30:00", called_by: "M. Okonkwo (fictional)" };

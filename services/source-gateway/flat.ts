// Reshapes USAspending bodies. raw = upstream keys unchanged (03 section 2.3 views apply); flat = one object whose keys are the usa_entity_v columns.
type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function flatRecipient(body: Json, fetchedAt: string): Json {
  const loc = (body.location ?? {}) as Json;
  return {
    uei: str(body.uei), recipient_level: str(body.recipient_level), recipient_id: str(body.recipient_id), legal_name: str(body.name),
    parent_uei: str(body.parent_uei), parent_name: str(body.parent_name),
    address_line1: str(loc.address_line1), address_line2: str(loc.address_line2), city_name: str(loc.city_name), state_code: str(loc.state_code),
    zip: str(loc.zip), country_code: str(loc.country_code),
    total_transaction_amount: typeof body.total_transaction_amount === "number" ? body.total_transaction_amount : null,
    parents_json: JSON.stringify(body.parents ?? []), alternate_names_json: JSON.stringify(body.alternate_names ?? []), fetched_at: fetchedAt,
  };
}

/** The children endpoint returns a top-level array, which Zetaris cannot explode; the gateway wraps it as { data: [...] }. */
export function wrapChildren(rows: unknown, parentUei: string, shape: "raw" | "flat"): { data: Json[] } {
  const list = (Array.isArray(rows) ? rows : []) as Json[];
  const size = list.length;
  return {
    data: list.map((r) => {
      const base: Json = { recipient_id: r.recipient_id ?? null, name: r.name ?? null, duns: r.duns ?? null, uei: r.uei ?? null, amount: r.amount ?? null, state_province: r.state_province ?? null };
      return shape === "flat" ? { ...base, parent_uei: parentUei, list_size: size } : base;
    }),
  };
}

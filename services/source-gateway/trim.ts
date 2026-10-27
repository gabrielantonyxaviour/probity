// EDGAR submissions projection (02 section 2.4): header metadata only, never the filings. Same keys in live, mirror and capture.
type Json = Record<string, unknown>;
const addr = (a: unknown): Json => {
  const x = (a ?? {}) as Json;
  return { street1: x.street1 ?? null, street2: x.street2 ?? null, city: x.city ?? null, stateOrCountry: x.stateOrCountry ?? null, zipCode: x.zipCode ?? null };
};

export function trimSubmissions(body: Json): Json {
  const addresses = (body.addresses ?? {}) as Json;
  const former = Array.isArray(body.formerNames) ? (body.formerNames as Json[]) : [];
  return {
    cik: String(body.cik ?? "").padStart(10, "0"), name: body.name ?? null,
    tickers: Array.isArray(body.tickers) ? body.tickers : [], exchanges: Array.isArray(body.exchanges) ? body.exchanges : [],
    ein: body.ein ?? null, sic: body.sic ?? null, sicDescription: body.sicDescription ?? null, stateOfIncorporation: body.stateOfIncorporation ?? null,
    phone: body.phone ?? null, addresses: { mailing: addr(addresses.mailing), business: addr(addresses.business) },
    formerNames: former.map((f) => ({ name: f.name ?? null, from: f.from ?? null, to: f.to ?? null })),
  };
}

/** company_tickers.json is a dynamic-key object; Zetaris reads the wrapped list form. */
export function tickersList(body: Json): { data: { cik_str: number; ticker: string; title: string }[] } {
  const rows = Object.values(body) as { cik_str: number; ticker: string; title: string }[];
  return { data: rows.map((r) => ({ cik_str: r.cik_str, ticker: r.ticker, title: r.title })) };
}

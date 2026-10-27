import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { extractClaims } from "../../app/agents/letter-reader/extract";
import { S1_LETTER_LINES, S1_EML } from "./_support/letter";

const cfg = loadConfig();
const models = createModelClient(cfg);
const text = S1_LETTER_LINES.join("\n");
for (const lane of ["deep", "fast"] as const) {
  const t0 = Date.now();
  try {
    const r = await extractClaims(text, { lane, models, eml: S1_EML });
    console.log(lane, "OK", Date.now() - t0, "ms", r.model_id, "tokens", r.tokens_in, r.tokens_out, "unsupported", r.unsupported);
    console.log(JSON.stringify({ name: r.claims?.claimed_name, addr: r.claims?.remit_address, bank: r.claims?.bank, acct_last4: r.account_number?.slice(-4), phones: r.claims?.phones, pressure: r.claims?.pressure_phrases, sender: r.claims?.sender_domain, reply: r.claims?.reply_to_domain, fields: r.claims?.fields.length }, null, 1));
  } catch (e) {
    console.log(lane, "ERR", String((e as Error).message).slice(0, 300), (e as { code?: string }).code);
  }
}

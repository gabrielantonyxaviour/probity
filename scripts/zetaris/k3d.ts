// K3d: payee_app insert is visible to DQ2 without re-activation, then the rows are removed.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";

const USL = "lightning.metastore.probity.vendor360";
const BCR = "BCR-9026-0001";
const BCR2 = "BCR-9026-0002";
const LOG = "CL-99001";
const LOG2 = "CL-99002";
const LABEL = "ZTEST synthetic K3d";

type Step = { name: string; ok: boolean; detail: string; latency_ms?: number; query_id?: string };

function psql(user: "payee_app" | "postgres", sql: string): string {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "payee-erp-db", "psql", "-U", user, "-d", "payee_erp", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "psql failed").trim().split("\n").slice(0, 6).join(" ");
    throw new Error(detail);
  }
  return result.stdout.trim();
}

function countPair(): { bank_change_request: number; vendor_contact_log: number } {
  const [bcr, logs] = psql(
    "postgres",
    "SELECT (SELECT count(*) FROM bank_change_request)::text || ' ' || (SELECT count(*) FROM vendor_contact_log)::text",
  ).split(" ");
  return { bank_change_request: Number(bcr), vendor_contact_log: Number(logs) };
}

async function dq(): Promise<{ invalid: number; total: number; valid: number; query_id: string; latency_ms: number }> {
  const result = await runZetaris(`RUN DQ account_single_vendor TABLE ${USL}.payment_run_item`, {
    key: "query",
    kind: "sql",
    limit: 5,
    queryId: randomUUID(),
  });
  const row = result.rows[0] ?? [];
  return {
    total: Number(row[3] ?? 0),
    valid: Number(row[4] ?? 0),
    invalid: Number(row[5] ?? 0),
    query_id: result.queryId,
    latency_ms: result.latencyMs,
  };
}

async function invalidIds(): Promise<{ ids: string[]; on_run: string[]; query_id: string; latency_ms: number }> {
  const result = await runZetaris(`SHOW DQ INVALID RECORD account_single_vendor TABLE ${USL}.payment_run_item`, {
    key: "query",
    kind: "sql",
    limit: 100,
    queryId: randomUUID(),
  });
  const ids = result.rows.map((row) => String(row[0] ?? ""));
  const on_run = result.rows.filter((row) => String(row[1] ?? "") === "PR-2026-10-30").map((row) => String(row[0] ?? ""));
  return { ids, on_run, query_id: result.queryId, latency_ms: result.latencyMs };
}

function v10812Account(): { hash: string; last4: string } {
  const line = psql(
    "postgres",
    "SELECT account_hash || ' ' || account_last4 FROM vendor_bank_account WHERE bank_account_id = 'BA-40812' AND vendor_id = 'V-10812' AND status = 'active'",
  );
  const [hash, last4] = line.split(" ");
  if (!/^[0-9a-f]{64}$/.test(hash ?? "") || !/^[0-9]{4}$/.test(last4 ?? "")) throw new Error("V-10812 account did not match the expected shape");
  return { hash: hash!, last4: last4! };
}

function insertRequest(id: string, hash: string, last4: string): string {
  const sql = `INSERT INTO bank_change_request (request_id, vendor_id, candidate_vendor_ids, claimed_name, letterhead_name, new_account_last4, new_account_hash, letter_phones, invoice_refs, received_at, channel, extraction_path, status, data_origin) VALUES ('${id}', NULL, '', '${LABEL}', '${LABEL}', '${last4}', '${hash}', '', '', '2026-10-27 14:45:00+00', 'typed', 'typed', 'pending', 'SYNTHETIC')`;
  psql("payee_app", sql);
  return sql;
}

function insertLog(id: string, requestId: string, vendorId: string): string {
  const sql = `INSERT INTO vendor_contact_log (log_id, vendor_id, request_id, purpose, phone_e164, phone_source, outcome, called_at, called_by, data_origin) VALUES ('${id}', '${vendorId}', '${requestId}', 'bank_change_callback', '+17575550163', 'other', 'no_answer', '2026-10-27 14:45:00+00', '${LABEL}', 'SYNTHETIC')`;
  psql("payee_app", sql);
  return sql;
}

function leftover(): number {
  return Number(
    psql(
      "postgres",
      `SELECT count(*) FROM bank_change_request WHERE request_id IN ('${BCR}','${BCR2}') OR claimed_name = '${LABEL}'
       UNION ALL
       SELECT count(*) FROM vendor_contact_log WHERE log_id IN ('${LOG}','${LOG2}') OR called_by = '${LABEL}'`,
    )
      .split("\n")
      .reduce((sum, line) => sum + Number(line), 0),
  );
}

function removeRows(): { as_payee_app: string; as_postgres: string } {
  const sql = `DELETE FROM vendor_contact_log WHERE log_id IN ('${LOG}','${LOG2}') OR called_by = '${LABEL}'; DELETE FROM bank_change_request WHERE request_id IN ('${BCR}','${BCR2}') OR claimed_name = '${LABEL}'`;
  let as_payee_app: string;
  try {
    psql("payee_app", sql);
    as_payee_app = "deleted";
  } catch (err) {
    as_payee_app = err instanceof Error ? err.message : "delete failed";
  }
  psql("postgres", "DELETE FROM vendor_contact_log WHERE log_id IN ('CL-99001','CL-99002') OR called_by = 'ZTEST synthetic K3d'");
  psql("postgres", "DELETE FROM bank_change_request WHERE request_id IN ('BCR-9026-0001','BCR-9026-0002') OR claimed_name = 'ZTEST synthetic K3d'");
  return { as_payee_app, as_postgres: "deleted" };
}

async function uslRow(table: "bank_change_request" | "vendor_contact_log", column: string, id: string): Promise<unknown> {
  const sql = `SELECT * FROM ${USL}.${table} WHERE ${column} = '${id}' LIMIT 5`;
  try {
    const result = await runZetaris(sql, { key: "query", kind: "sql", limit: 5, queryId: randomUUID() });
    return { sql, query_id: result.queryId, latency_ms: result.latencyMs, columns: result.columns, rows: result.rows };
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "select failed");
    return { sql, error: typed.message, code: typed.code };
  }
}

async function main(): Promise<void> {
  const steps: Step[] = [];
  const before = countPair();
  const account = v10812Account();
  let removed: boolean;
  const capture: Record<string, unknown> = {
    at: new Date().toISOString(),
    id_decision:
      "bank_change_request.request_id must match ^BCR-[0-9]{4}-[0-9]{4}$ and vendor_contact_log.log_id must match ^CL-[0-9]{5}$. A ZTEST- prefix is rejected, so the rows use BCR-9026-0001 and CL-99001 and are labelled ZTEST synthetic K3d.",
    delete_decision:
      "payee_app is granted INSERT and SELECT only. DELETE is attempted as payee_app, then issued as postgres so the synthetic rows cannot remain. Grants are not changed.",
    before,
    steps,
  };
  const onStop = (): void => {
    try {
      capture.remove = removeRows();
      capture.leftover = leftover();
      capture.interrupted = true;
    } catch (err) {
      capture.remove_error = err instanceof Error ? err.message : "cleanup failed";
    }
    writeFileSync("zetaris/results/k3d.json", `${JSON.stringify(capture, null, 2)}\n`);
    process.exit(143);
  };
  process.once("SIGTERM", onStop);
  process.once("SIGINT", onStop);
  try {
    let ztest = "not tried";
    try {
      psql("payee_app", `INSERT INTO bank_change_request (request_id, received_at, channel, extraction_path, status) VALUES ('ZTEST-K3D-0001', '2026-10-27 14:45:00+00', 'typed', 'typed', 'pending')`);
      ztest = "inserted";
    } catch (err) {
      ztest = err instanceof Error ? err.message : "rejected";
    }
    steps.push({ name: "ztest_prefix", ok: ztest !== "inserted", detail: ztest });
    const n0 = await dq();
    const show0 = await invalidIds();
    capture.n0 = n0;
    capture.show0 = show0;
    const insertSql = insertRequest(BCR, account.hash, account.last4);
    const logSql = insertLog(LOG, BCR, "V-10812");
    capture.insert_sql = [insertSql, logSql];
    const n1 = await dq();
    const show1 = await invalidIds();
    capture.n1 = n1;
    capture.show1 = show1;
    capture.usl_bank = await uslRow("bank_change_request", "request_id", BCR);
    capture.usl_log = await uslRow("vendor_contact_log", "log_id", LOG);
    const gained = show1.ids.filter((id) => !show0.ids.includes(id));
    capture.gained_ids = gained;
    capture.pri_1030_0009_before = show0.ids.includes("PRI-1030-0009");
    capture.pri_1030_0009_after = show1.ids.includes("PRI-1030-0009");
    // V-10812's account is already shared by live requests, so this insert may not add an invalid item.
    // A second synthetic request on a currently single-owner account, off the demo run, shows the +1.
    if (n1.invalid === n0.invalid) {
      const line = psql(
        "postgres",
        `WITH owners AS (
           SELECT account_hash, vendor_id AS owner FROM vendor_bank_account WHERE account_hash IS NOT NULL
           UNION ALL
           SELECT new_account_hash, COALESCE(vendor_id, request_id) FROM bank_change_request WHERE new_account_hash IS NOT NULL
         ), counts AS (
           SELECT account_hash, COUNT(DISTINCT owner) AS n FROM owners GROUP BY account_hash
         )
         SELECT i.item_id || ' ' || b.vendor_id || ' ' || b.account_hash || ' ' || b.account_last4
         FROM payment_run_item i
         JOIN vendor_bank_account b ON b.bank_account_id = i.bank_account_id
         JOIN counts c ON c.account_hash = b.account_hash
         WHERE c.n = 1 AND i.payment_run_id <> 'PR-2026-10-30'
           AND (SELECT count(*) FROM payment_run_item i2 JOIN vendor_bank_account b2 ON b2.bank_account_id = i2.bank_account_id
                WHERE b2.account_hash = b.account_hash) = 1
         ORDER BY i.item_id
         LIMIT 1`,
      );
      const [itemId, vendorId, hash, last4] = line.split(" ");
      if (!/^PRI-/.test(itemId ?? "") || !/^V-/.test(vendorId ?? "") || !/^[0-9a-f]{64}$/.test(hash ?? "") || !/^[0-9]{4}$/.test(last4 ?? "")) {
        throw new Error("no single-owner account was available for the follow-up insert");
      }
      const followSql = insertRequest(BCR2, hash!, last4!);
      const followLog = insertLog(LOG2, BCR2, vendorId!);
      capture.follow_up = { item_id: itemId, vendor_id: vendorId, reason: "V-10812 account was already shared, so DQ2 invalid count did not move", sql: [followSql, followLog] };
      const nFollow = await dq();
      const showFollow = await invalidIds();
      capture.n_follow = nFollow;
      capture.show_follow = showFollow;
      capture.gained_ids_follow = showFollow.ids.filter((id) => !show0.ids.includes(id));
      steps.push({
        name: "dq2_follow",
        ok: nFollow.invalid === n0.invalid + 1 && (capture.gained_ids_follow as string[]).includes(itemId!),
        detail: `invalid ${n0.invalid} -> ${nFollow.invalid}; gained ${(capture.gained_ids_follow as string[]).join(",") || "none"}`,
      });
    }
    steps.push({
      name: "dq2",
      ok: true,
      detail: `invalid ${n0.invalid} -> ${n1.invalid}; gained ${gained.join(",") || "none"}; PRI-1030-0009 before=${capture.pri_1030_0009_before} after=${capture.pri_1030_0009_after}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "k3d failed";
    capture.error = message;
    steps.push({ name: "failed", ok: false, detail: message.slice(0, 400) });
  } finally {
    try {
      capture.remove = removeRows();
      const left = leftover();
      capture.leftover = left;
      removed = left === 0;
    } catch (err) {
      capture.remove_error = err instanceof Error ? err.message : "cleanup failed";
      removed = false;
    }
  }
  try {
    const after = countPair();
    capture.after = after;
    const n0 = capture.n0 as { invalid: number } | undefined;
    if (n0) {
      const n2 = await dq();
      const show2 = await invalidIds();
      capture.n2 = n2;
      capture.show2 = show2;
      capture.restored =
        removed &&
        after.bank_change_request === before.bank_change_request &&
        after.vendor_contact_log === before.vendor_contact_log &&
        n2.invalid === n0.invalid;
    } else {
      capture.restored = false;
    }
  } catch (err) {
    capture.post_error = err instanceof Error ? err.message : "post check failed";
    capture.restored = false;
  }
  writeFileSync("zetaris/results/k3d.json", `${JSON.stringify(capture, null, 2)}\n`);
  const n0i = (capture.n0 as { invalid?: number } | undefined)?.invalid ?? "na";
  const n1i = (capture.n1 as { invalid?: number } | undefined)?.invalid ?? "na";
  const n2i = (capture.n2 as { invalid?: number } | undefined)?.invalid ?? "na";
  const after = capture.after as { bank_change_request: number; vendor_contact_log: number } | undefined;
  process.stdout.write(
    `k3d before=${before.bank_change_request}/${before.vendor_contact_log} after=${after?.bank_change_request ?? "na"}/${after?.vendor_contact_log ?? "na"} invalid ${n0i}->${n1i}->${n2i} restored=${capture.restored}\n`,
  );
  if (!removed) process.exit(2);
  if (capture.error || capture.remove_error || capture.post_error) process.exit(1);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "k3d failed";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

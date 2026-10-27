import { describe, expect, it } from "vitest";
import { t11SplitQueries } from "../../../app/orchestration/adapters/template-kit";

describe("T11 split fallback (K1d2)", () => {
  it("each read declares exactly the columns its SELECT returns, so the header check cannot fail the split", () => {
    const { reads } = t11SplitQueries({ parent_uei: "JCBMLGPE6Z71", addr_key: "1 TECHNOLOGY CT|TINTON FALLS|NJ" }, ["session.pp_usa_r_khk6e1jw9c15"]);
    expect(reads).toHaveLength(2);
    for (const r of reads) {
      const select = r.sql.slice("SELECT ".length, r.sql.indexOf(" FROM "));
      const items: string[] = [];
      let depth = 0;
      let cur = "";
      for (const ch of select) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          items.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      items.push(cur.trim());
      const names = items.map((it) => (/ AS ([a-z_0-9]+)$/.exec(it)?.[1] ?? it.split(".").pop()!));
      expect(names).toEqual(r.columns);
    }
    expect(reads[1]!.columns).not.toContain("vendor_id_on_file");
  });
});

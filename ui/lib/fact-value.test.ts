import { describe, expect, it } from "vitest";
import { factValue } from "./fact-value";

describe("factValue", () => {
  it("rewords ERP row strings without changing their facts", () => {
    expect(factValue("vendor_bank_account, V-10812, active, 2026-10-18 13:02:00")).toBe("On V-10812, active since 18 Oct 2026");
    expect(factValue("bank_change_request, V-10027, held, 2026-10-22 15:12:00")).toBe("Change request for V-10027, held, 22 Oct 2026");
    expect(factValue("(703) 902-5000 (2019-04-02 12:00:00 → 2026-10-19 16:20:00)")).toBe("(703) 902-5000, on file 2 Apr 2019 to 19 Oct 2026");
    expect(factValue("(703) 555-0182 (2026-10-19 16:20:00 → null)")).toBe("(703) 555-0182, on file since 19 Oct 2026");
  });
  it("formats bare US phone digits", () => {
    expect(factValue("3217279100")).toBe("(321) 727-9100");
    expect(factValue("703-902-5000")).toBe("(703) 902-5000");
    expect(factValue("3217279100 (2019-07-01 12:00:00 → null)")).toBe("(321) 727-9100, on file since 1 Jul 2019");
    expect(factValue("0000202058")).toBe("0000202058");
  });
  it("passes other values through", () => {
    expect(factValue("8283 GREENSBORO DR, MCLEAN, VA")).toBe("8283 GREENSBORO DR, MCLEAN, VA");
    expect(factValue(null)).toBe("—");
  });
});

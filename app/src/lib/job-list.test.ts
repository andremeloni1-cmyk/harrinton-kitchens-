import { describe, it, expect } from "vitest";
import { isUnbilled } from "./job-list";

// P1-10: a completed job with only a 30% deposit must still read as unbilled —
// the raised invoices have to cover the contract value, not just exist.
describe("isUnbilled (P1-10)", () => {
  it("is false for jobs that aren't completed", () => {
    expect(isUnbilled("in_progress", 1000, [])).toBe(false);
    expect(isUnbilled("scheduled", 1000, [{ status: "authorised", total: 330 }])).toBe(false);
  });

  it("flags a completed job whose only raised invoice is a deposit", () => {
    // contract inc = 1000 * 1.1 = 1100; deposit raised = 330 < 1100
    expect(isUnbilled("completed", 1000, [{ status: "authorised", total: 330 }])).toBe(true);
  });

  it("is billed once raised invoices cover the contract", () => {
    expect(
      isUnbilled("completed", 1000, [
        { status: "authorised", total: 330 },
        { status: "authorised", total: 770 },
      ])
    ).toBe(false);
  });

  it("ignores draft and voided invoices when summing what's been raised", () => {
    expect(
      isUnbilled("completed", 1000, [
        { status: "draft", total: 1100 },
        { status: "voided", total: 1100 },
      ])
    ).toBe(true);
  });

  it("falls back to any-raised-invoice when the contract value is unknown", () => {
    expect(isUnbilled("completed", null, [])).toBe(true);
    expect(isUnbilled("completed", null, [{ status: "authorised", total: 100 }])).toBe(false);
    expect(isUnbilled("completed", 0, [{ status: "paid", total: 50 }])).toBe(false);
  });
});

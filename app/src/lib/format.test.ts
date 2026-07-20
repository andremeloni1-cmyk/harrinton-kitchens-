import { describe, it, expect } from "vitest";
import { fmtMoney, fmtRange } from "./format";

describe("fmtMoney", () => {
  it("renders AUD by default", () => {
    // Non-breaking spaces / symbol placement vary by ICU build, so assert on the
    // stable parts rather than an exact string.
    const out = fmtMoney(1234.5);
    expect(out).toContain("1,234.50");
    expect(out).toMatch(/\$/);
  });

  it("returns an em dash for null/undefined", () => {
    expect(fmtMoney(null)).toBe("—");
    expect(fmtMoney(undefined)).toBe("—");
  });

  it("formats zero as a currency value, not a dash", () => {
    expect(fmtMoney(0)).toContain("0.00");
  });

  it("honours an explicit currency", () => {
    expect(fmtMoney(10, "USD")).toContain("10.00");
  });
});

describe("fmtRange", () => {
  it("says Unscheduled when there is no start", () => {
    expect(fmtRange(null)).toBe("Unscheduled");
  });

  it("returns a single time when there is no end", () => {
    const start = new Date(2026, 6, 22, 9, 0);
    expect(fmtRange(start)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("joins start and end with an en dash", () => {
    const start = new Date(2026, 6, 22, 9, 0);
    const end = new Date(2026, 6, 22, 15, 0);
    expect(fmtRange(start, end)).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
  });
});

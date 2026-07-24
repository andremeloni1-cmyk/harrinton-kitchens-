import { describe, it, expect } from "vitest";
import { businessYMD } from "./business-day";

// P0-11: the business day must come from BUSINESS_TZ, not the server's UTC day —
// otherwise a UTC VPS reports yesterday every weekday morning.
describe("businessYMD", () => {
  it("uses the business timezone, not UTC, across the UTC-midnight boundary", () => {
    // 2026-01-14T20:00:00Z is still the 14th in UTC but already 07:00 on the
    // 15th in Sydney (AEDT, +11).
    const d = new Date("2026-01-14T20:00:00Z");
    expect(businessYMD(d, "Australia/Sydney")).toBe("2026-01-15");
    expect(businessYMD(d, "UTC")).toBe("2026-01-14");
  });

  it("resolves 02:00Z to the correct Sydney day (still 'today' in Sydney)", () => {
    // Monday 02:00Z = Monday 13:00 Sydney — same calendar day, the case the UTC
    // derivation happened to get right; the divergence is the pre-midnight case above.
    expect(businessYMD(new Date("2026-01-19T02:00:00Z"), "Australia/Sydney")).toBe("2026-01-19");
  });

  it("formats as zero-padded YYYY-MM-DD", () => {
    expect(businessYMD(new Date("2026-03-05T12:00:00Z"), "UTC")).toBe("2026-03-05");
  });

  it("defaults to BUSINESS_TZ (Sydney): a late-UTC instant reads as the next Sydney day", () => {
    // 2026-06-30T23:30:00Z → Sydney (AEST, +10) = 2026-07-01 09:30.
    expect(businessYMD(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

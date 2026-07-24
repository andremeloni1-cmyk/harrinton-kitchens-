import { describe, it, expect, vi } from "vitest";

// combineDateTime is pure date maths, but leads.ts pulls in prisma + the Google
// integration modules; stub the ones with construction side effects so the
// module loads in a plain node test.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { combineDateTime } from "./leads";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("combineDateTime (P3-1)", () => {
  it("rejects missing or malformed dates", () => {
    expect(combineDateTime(undefined)).toBeNull();
    expect(combineDateTime("2026/07/01")).toBeNull();
    expect(combineDateTime("not-a-date")).toBeNull();
  });

  it("defaults to the 06:30 work-day start when no time is given", () => {
    const d = combineDateTime("2099-03-04");
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(6);
    expect(d!.getMinutes()).toBe(30);
  });

  it("keeps a recent past date as-is (does NOT bump the year)", () => {
    // ~20 days ago is well inside the 11-month window — a legitimately recent
    // booking must not be shoved a year forward.
    const recent = new Date(Date.now() - 20 * 86_400_000);
    const d = combineDateTime(ymd(recent));
    expect(d!.getFullYear()).toBe(recent.getFullYear());
    expect(d!.getMonth()).toBe(recent.getMonth());
  });

  it("rolls a wrong-year date (well over a year past) forward into range", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    const d = combineDateTime(ymd(twoYearsAgo));
    // Bumped up until it's no longer >11 months in the past.
    expect(d!.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
  });

  it("leaves a future date untouched", () => {
    const d = combineDateTime("2099-12-31", "14:00");
    expect(ymd(d!)).toBe("2099-12-31");
    expect(d!.getHours()).toBe(14);
  });
});

import { describe, it, expect } from "vitest";
import {
  WORKDAY_MINS,
  workdaySegments,
  jobEnd,
  intervalsOverlap,
  startOfWeek,
} from "./schedule";

const MIN = 60_000;
const totalMins = (segs: { start: Date; end: Date }[]) =>
  segs.reduce((n, s) => n + (s.end.getTime() - s.start.getTime()) / MIN, 0);

// Dates are built in local time (new Date(y, m, d, h, min)); assertions use
// relative/structural properties and local getDay(), so the suite is timezone
// independent. Reference weekdays: 20 Jul 2026 = Mon, 22 = Wed, 24 = Fri.

describe("WORKDAY_MINS", () => {
  it("is 6:30am–3:00pm = 510 minutes", () => {
    expect(WORKDAY_MINS).toBe(510);
  });
});

describe("workdaySegments", () => {
  it("keeps a short job within a single day and preserves its duration", () => {
    const start = new Date(2026, 6, 22, 8, 0); // Wed 08:00
    const segs = workdaySegments(start, 120);
    expect(segs).toHaveLength(1);
    expect(totalMins(segs)).toBe(120);
    expect(segs[0].start.getTime()).toBe(start.getTime());
  });

  it("spills a long job across working days, conserving total minutes", () => {
    const start = new Date(2026, 6, 22, 6, 30); // Wed 06:30 (work start)
    const segs = workdaySegments(start, WORKDAY_MINS * 2 + 60); // 2.2 work days
    expect(segs).toHaveLength(3);
    expect(totalMins(segs)).toBeCloseTo(WORKDAY_MINS * 2 + 60, 5);
    // No segment exceeds a single working day.
    for (const s of segs) {
      expect((s.end.getTime() - s.start.getTime()) / MIN).toBeLessThanOrEqual(WORKDAY_MINS);
    }
  });

  it("skips weekends when spilling over", () => {
    const friday = new Date(2026, 6, 24, 6, 30); // Fri 06:30
    const segs = workdaySegments(friday, WORKDAY_MINS + 60); // spills past Friday
    expect(segs).toHaveLength(2);
    const nextDay = segs[1].start.getDay();
    expect(nextDay === 0 || nextDay === 6).toBe(false); // not Sat/Sun
    expect(segs[1].start.getDay()).toBe(1); // lands on Monday
  });

  it("always returns at least one segment for zero/negative duration", () => {
    const start = new Date(2026, 6, 22, 9, 0);
    expect(workdaySegments(start, 0).length).toBeGreaterThanOrEqual(1);
    expect(workdaySegments(start, -30).length).toBeGreaterThanOrEqual(1);
  });
});

describe("jobEnd", () => {
  it("equals the end of the last working-day segment", () => {
    const start = new Date(2026, 6, 22, 8, 0);
    const segs = workdaySegments(start, 300);
    expect(jobEnd(start, 300).getTime()).toBe(segs[segs.length - 1].end.getTime());
  });
});

describe("intervalsOverlap", () => {
  const t = (h: number) => new Date(2026, 6, 22, h, 0);
  it("detects a genuine overlap", () => {
    expect(intervalsOverlap(t(9), t(11), t(10), t(12))).toBe(true);
  });
  it("treats touching edges as non-overlapping", () => {
    expect(intervalsOverlap(t(9), t(10), t(10), t(11))).toBe(false);
  });
  it("returns false for disjoint intervals", () => {
    expect(intervalsOverlap(t(9), t(10), t(11), t(12))).toBe(false);
  });
});

describe("startOfWeek", () => {
  it("returns Monday 00:00 for a mid-week date", () => {
    const wed = new Date(2026, 6, 22, 15, 30); // Wed 22 Jul 2026
    const mon = startOfWeek(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
    expect(mon.getDate()).toBe(20); // Mon 20 Jul 2026
  });
  it("is idempotent when given a Monday", () => {
    const mon = new Date(2026, 6, 20, 9, 0);
    expect(startOfWeek(mon).getDate()).toBe(20);
    expect(startOfWeek(mon).getDay()).toBe(1);
  });
});

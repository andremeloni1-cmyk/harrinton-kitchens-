import { describe, it, expect } from "vitest";
import {
  isWorkingDay, isWeekendDay, nextWorkingDay, prevWorkingDay, workingDays, addDays,
  capacityOn, utilisation, estimateStationHours, estimateJobHours,
  earliestFinish, feasibleBy, proposeBlocks, parseHolidays, mondayOf, type StationHours,
} from "./capacity";

// Reference calendar: 2026-01-05 is a Monday. Jan 10/11 are Sat/Sun.
const MON = "2026-01-05", TUE = "2026-01-06", WED = "2026-01-07", THU = "2026-01-08", FRI = "2026-01-09";
const SAT = "2026-01-10", SUN = "2026-01-11", MON2 = "2026-01-12";

describe("date helpers", () => {
  it("knows weekends", () => {
    expect(isWeekendDay(SAT)).toBe(true);
    expect(isWeekendDay(SUN)).toBe(true);
    expect(isWeekendDay(MON)).toBe(false);
  });
  it("respects holidays as non-working", () => {
    expect(isWorkingDay(TUE)).toBe(true);
    expect(isWorkingDay(TUE, new Set([TUE]))).toBe(false);
  });
  it("skips weekends moving forward/back", () => {
    expect(nextWorkingDay(FRI)).toBe(MON2);
    expect(prevWorkingDay(MON2)).toBe(FRI);
  });
  it("skips a holiday too", () => {
    expect(nextWorkingDay(MON, new Set([TUE]))).toBe(WED);
  });
  it("lists working days in a range", () => {
    expect(workingDays(MON, MON2)).toEqual([MON, TUE, WED, THU, FRI, MON2]);
  });
  it("snaps to the Monday of the week", () => {
    expect(mondayOf(WED)).toBe(MON);
    expect(mondayOf(SUN)).toBe(MON);
    expect(mondayOf(MON)).toBe(MON);
  });
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
});

describe("parseHolidays", () => {
  it("keeps valid ISO days, sorted & deduped", () => {
    expect(parseHolidays('["2026-01-26","2026-01-01","2026-01-26"]')).toEqual(["2026-01-01", "2026-01-26"]);
  });
  it("rejects junk", () => {
    expect(parseHolidays(null)).toEqual([]);
    expect(parseHolidays("nope")).toEqual([]);
    expect(parseHolidays('["2026-1-1","bad",5]')).toEqual([]);
  });
});

describe("capacityOn", () => {
  const s = { id: "s", hoursPerDay: 8 };
  it("is the station's hours on a work day", () => expect(capacityOn(s, MON)).toBe(8));
  it("is zero on a weekend", () => expect(capacityOn(s, SAT)).toBe(0));
  it("is zero on a holiday", () => expect(capacityOn(s, MON, new Set([MON]))).toBe(0));
});

describe("utilisation", () => {
  const stations = [{ id: "cut", hoursPerDay: 8 }];
  it("computes booked/capacity/pct and flags overload", () => {
    const cells = utilisation(stations, [{ stationId: "cut", day: MON, hours: 10 }], [MON]);
    expect(cells[0]).toEqual({ stationId: "cut", day: MON, booked: 10, capacity: 8, pct: 125, overloaded: true });
  });
  it("under capacity is not overloaded", () => {
    const cells = utilisation(stations, [{ stationId: "cut", day: MON, hours: 4 }], [MON]);
    expect(cells[0].pct).toBe(50);
    expect(cells[0].overloaded).toBe(false);
  });
  it("work booked on a holiday is overloaded with pct 999", () => {
    const cells = utilisation(stations, [{ stationId: "cut", day: MON, hours: 3 }], [MON], new Set([MON]));
    expect(cells[0]).toEqual({ stationId: "cut", day: MON, booked: 3, capacity: 0, pct: 999, overloaded: true });
  });
  it("sums multiple blocks on the same day", () => {
    const cells = utilisation(stations, [
      { stationId: "cut", day: MON, hours: 3 },
      { stationId: "cut", day: MON, hours: 3 },
    ], [MON]);
    expect(cells[0].booked).toBe(6);
  });
});

describe("estimates", () => {
  it("hours scale with cabinet count", () => {
    expect(estimateStationHours(4, 1)).toBe(4);
    expect(estimateStationHours(10)).toBe(7.5); // default 0.75/cab
  });
  it("estimateJobHours honours per-station overrides", () => {
    const stations = [{ id: "cut", hoursPerDay: 8 }, { id: "asm", hoursPerDay: 8 }];
    const est = estimateJobHours(10, stations, { asm: 1.5 });
    expect(est).toEqual([
      { stationId: "cut", hoursPerDay: 8, hours: 7.5 },
      { stationId: "asm", hoursPerDay: 8, hours: 15 },
    ]);
  });
});

describe("earliestFinish / feasibleBy", () => {
  const two: StationHours[] = [
    { stationId: "cut", hours: 16, hoursPerDay: 8 },
    { stationId: "asm", hours: 8, hoursPerDay: 8 },
  ];
  it("runs stations sequentially across days", () => {
    // cut: Mon+Tue (16h). asm starts Wed (8h) → finish Wed.
    expect(earliestFinish(MON, two)).toBe(WED);
  });
  it("skips the weekend", () => {
    // one 16h station from Fri → Fri(8h) then Mon(8h).
    expect(earliestFinish(FRI, [{ stationId: "cut", hours: 16, hoursPerDay: 8 }])).toBe(MON2);
  });
  it("answers feasibility for a target date", () => {
    expect(feasibleBy(WED, MON, two)).toBe(true);
    expect(feasibleBy(TUE, MON, two)).toBe(false);
  });
  it("returns null when there's no work", () => {
    expect(earliestFinish(MON, [{ stationId: "cut", hours: 0, hoursPerDay: 8 }])).toBe(null);
  });
});

describe("proposeBlocks", () => {
  it("packs stations in order finishing by the due date", () => {
    const blocks = proposeBlocks([
      { stationId: "cut", hours: 8, hoursPerDay: 8 },
      { stationId: "asm", hours: 8, hoursPerDay: 8 },
    ], FRI);
    expect(blocks).toEqual([
      { stationId: "cut", day: THU, hours: 8 },
      { stationId: "asm", day: FRI, hours: 8 },
    ]);
  });
  it("splits over capacity and skips the weekend going backward", () => {
    // 16h @8/day due Monday → Fri(8) + Mon(8), weekend skipped.
    const blocks = proposeBlocks([{ stationId: "cut", hours: 16, hoursPerDay: 8 }], MON2);
    expect(blocks).toEqual([
      { stationId: "cut", day: FRI, hours: 8 },
      { stationId: "cut", day: MON2, hours: 8 },
    ]);
  });
  it("moves the due date off a weekend", () => {
    const blocks = proposeBlocks([{ stationId: "cut", hours: 8, hoursPerDay: 8 }], SAT);
    expect(blocks).toEqual([{ stationId: "cut", day: FRI, hours: 8 }]);
  });
});

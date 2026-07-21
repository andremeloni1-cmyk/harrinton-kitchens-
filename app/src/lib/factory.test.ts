import { describe, it, expect } from "vitest";
import { parseChecklist, currentStation, factoryProgress, isJobBlocked, reachedCount, partProgressByStation, overallPartProgress, dispatchReadiness } from "./factory";

describe("parseChecklist", () => {
  it("parses valid items and coerces done", () => {
    expect(parseChecklist(JSON.stringify([{ label: "Cut panels", done: 1 }, { label: "Edge", done: false }])))
      .toEqual([{ label: "Cut panels", done: true }, { label: "Edge", done: false }]);
  });
  it("returns [] for junk", () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist("nope")).toEqual([]);
    expect(parseChecklist(JSON.stringify([{ nope: 1 }]))).toEqual([]);
  });
});

describe("currentStation", () => {
  const line = [
    { id: "a", position: 0, status: "done" },
    { id: "b", position: 1, status: "done" },
    { id: "c", position: 2, status: "in_progress" },
    { id: "d", position: 3, status: "pending" },
  ];
  it("is the first not-done station by position", () => {
    expect(currentStation(line)?.id).toBe("c");
  });
  it("ignores array order, uses position", () => {
    const shuffled = [line[3], line[0], line[2], line[1]];
    expect(currentStation(shuffled)?.id).toBe("c");
  });
  it("is null when everything is done", () => {
    expect(currentStation(line.map((s) => ({ ...s, status: "done" })))).toBe(null);
  });
});

describe("factoryProgress", () => {
  it("counts done stations", () => {
    expect(factoryProgress([{ status: "done" }, { status: "done" }, { status: "pending" }, { status: "in_progress" }]))
      .toEqual({ done: 2, total: 4, pct: 50 });
  });
  it("handles an empty line", () => {
    expect(factoryProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe("isJobBlocked", () => {
  it("is true when any station is blocked", () => {
    expect(isJobBlocked([{ blocked: false }, { blocked: true }])).toBe(true);
    expect(isJobBlocked([{ blocked: false }])).toBe(false);
  });
});

describe("part progress from scans", () => {
  // 4 parts: reached positions 2, 2, 0, null (unscanned)
  const lastPos = [2, 2, 0, null];
  it("counts parts that reached at least a station position", () => {
    expect(reachedCount(lastPos, 0)).toBe(3); // three have been scanned somewhere
    expect(reachedCount(lastPos, 2)).toBe(2); // two reached position 2+
    expect(reachedCount(lastPos, 3)).toBe(0);
  });
  it("derives per-station percentages", () => {
    const prog = partProgressByStation(lastPos, [
      { id: "a", position: 0 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ]);
    expect(prog[0]).toEqual({ stationId: "a", done: 3, total: 4, pct: 75 });
    expect(prog[1]).toEqual({ stationId: "b", done: 2, total: 4, pct: 50 });
    expect(prog[2]).toEqual({ stationId: "c", done: 0, total: 4, pct: 0 });
  });
});

describe("overallPartProgress", () => {
  it("averages each part's fraction through the line", () => {
    // 3 stations; indices 2,1,0,null → 1 + 2/3 + 1/3 + 0 = 2.0 over 4 = 50%
    expect(overallPartProgress([2, 1, 0, null], 3)).toBe(50);
  });
  it("is 100 when every part reached the last station", () => {
    expect(overallPartProgress([2, 2, 2], 3)).toBe(100);
  });
  it("is 0 for no parts or no stations", () => {
    expect(overallPartProgress([], 3)).toBe(0);
    expect(overallPartProgress([1, 2], 0)).toBe(0);
    expect(overallPartProgress([null, null], 3)).toBe(0);
  });
});

describe("dispatchReadiness", () => {
  it("is ready only when every part is scanned out", () => {
    const r = dispatchReadiness([
      { cabinet: "A", reached: true },
      { cabinet: "A", reached: true },
      { cabinet: "B", reached: false },
    ]);
    expect(r.ready).toBe(false);
    expect(r.cabinets).toEqual([
      { name: "A", out: 2, total: 2 },
      { name: "B", out: 0, total: 1 },
    ]);
  });
  it("is ready when all parts reached dispatch", () => {
    expect(dispatchReadiness([{ cabinet: "A", reached: true }]).ready).toBe(true);
  });
  it("treats an empty cut list as ready (nothing to hold back)", () => {
    expect(dispatchReadiness([]).ready).toBe(true);
  });
  it("groups loose parts under a label", () => {
    expect(dispatchReadiness([{ cabinet: null, reached: false }]).cabinets[0].name).toBe("Loose parts");
  });
});

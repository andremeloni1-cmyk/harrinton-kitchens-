import { describe, it, expect } from "vitest";
import { parseChecklist, currentStation, factoryProgress, isJobBlocked } from "./factory";

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

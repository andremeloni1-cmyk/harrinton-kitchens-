import { describe, it, expect } from "vitest";
import { extractMm, capturedMm, findDiscrepancies, variationDraftFrom } from "./variation";
import { emptyRoom, type CheckMeasureData } from "./measure";

describe("extractMm", () => {
  it("reads mm/cm/m with explicit units and normalises to mm", () => {
    expect(extractMm("3600mm run, 2.4m ceiling, 90 cm gap")).toEqual([3600, 2400, 900]);
  });
  it("ignores unit-less numbers (prices, quantities)", () => {
    expect(extractMm("6 base units at $320 each, order 12")).toEqual([]);
  });
});

function measureWith(mm: { walls?: number[]; ceiling?: number }): CheckMeasureData {
  const room = emptyRoom("r1");
  room.walls = (mm.walls ?? []).map((v, i) => ({ label: `W${i}`, mm: v }));
  room.ceilingMm = mm.ceiling ?? null;
  return { rooms: [room] };
}

describe("capturedMm", () => {
  it("collects all real dimensions across rooms", () => {
    expect(capturedMm(measureWith({ walls: [3600, 2100], ceiling: 2400 })).sort()).toEqual([2100, 2400, 3600]);
  });
});

describe("findDiscrepancies", () => {
  it("returns nothing when the measure matches the quote within tolerance", () => {
    const measure = measureWith({ walls: [3600, 2100], ceiling: 2400 });
    const d = findDiscrepancies(measure, "Kitchen 3600mm x 2100mm, 2400mm ceiling");
    expect(d).toEqual([]);
  });

  it("flags a quoted dimension the measure doesn't match", () => {
    const measure = measureWith({ walls: [3200] }); // measured shorter than quoted
    const d = findDiscrepancies(measure, "Run of 3600mm cabinetry");
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain("3600mm");
    expect(d[0].note).toContain("3200mm");
  });

  it("flags when the quote listed no dimensions at all", () => {
    const measure = measureWith({ walls: [3600] });
    const d = findDiscrepancies(measure, "Supply and install kitchen, 6 base units");
    expect(d).toHaveLength(1);
    expect(d[0].note).toMatch(/no dimensions/i);
  });

  it("returns nothing when nothing was measured", () => {
    expect(findDiscrepancies({ rooms: [] }, "3600mm")).toEqual([]);
    expect(findDiscrepancies(measureWith({}), "3600mm")).toEqual([]);
  });

  it("respects the tolerance", () => {
    const measure = measureWith({ walls: [3640] }); // 40mm off
    expect(findDiscrepancies(measure, "3600mm", 50)).toEqual([]); // within tolerance
    expect(findDiscrepancies(measure, "3600mm", 20)).toHaveLength(1); // outside
  });
});

describe("variationDraftFrom", () => {
  it("builds a titled, bulleted draft", () => {
    const draft = variationDraftFrom([{ note: "A" }, { note: "B" }]);
    expect(draft.title).toMatch(/variation/i);
    expect(draft.description).toContain("• A");
    expect(draft.description).toContain("• B");
  });
});

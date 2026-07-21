import { describe, it, expect } from "vitest";
import { normalizeCutList, cutListSummary, isEmptyCutList } from "./cutlist";

describe("normalizeCutList", () => {
  it("coerces dims/qty and keeps well-formed cabinets", () => {
    const cl = normalizeCutList({
      cabinets: [
        {
          name: "Base 600",
          parts: [
            { name: "Side", material: "16mm White", edging: "1mm long", widthMm: "720", heightMm: 560, qty: "2" },
            { name: "Shelf", width: 568, height: 300 }, // alt keys, no qty → 1
            { nope: true }, // dropped (no name)
          ],
        },
        { name: "", parts: [] }, // dropped (no name)
      ],
      hardware: [{ name: "Blum hinge", qty: 4 }, { qty: 2 }],
    });
    expect(cl.cabinets).toHaveLength(1);
    expect(cl.cabinets[0].parts).toHaveLength(2);
    expect(cl.cabinets[0].parts[0]).toEqual({ name: "Side", material: "16mm White", edging: "1mm long", widthMm: 720, heightMm: 560, qty: 2 });
    expect(cl.cabinets[0].parts[1].qty).toBe(1);
    expect(cl.cabinets[0].parts[1].widthMm).toBe(568);
    expect(cl.hardware).toEqual([{ name: "Blum hinge", qty: 4 }]);
  });

  it("returns an empty structure for junk", () => {
    expect(normalizeCutList(null)).toEqual({ cabinets: [], hardware: [] });
    expect(normalizeCutList("nope")).toEqual({ cabinets: [], hardware: [] });
    expect(normalizeCutList({})).toEqual({ cabinets: [], hardware: [] });
  });
});

describe("cutListSummary / isEmptyCutList", () => {
  it("counts cabinets, parts and hardware", () => {
    const cl = normalizeCutList({
      cabinets: [{ name: "A", parts: [{ name: "p1" }, { name: "p2" }] }, { name: "B", parts: [{ name: "p3" }] }],
      hardware: [{ name: "h1" }],
    });
    expect(cutListSummary(cl)).toEqual({ cabinets: 2, parts: 3, hardware: 1 });
    expect(isEmptyCutList(cl)).toBe(false);
  });
  it("detects an empty cut list", () => {
    expect(isEmptyCutList(normalizeCutList({}))).toBe(true);
  });
});

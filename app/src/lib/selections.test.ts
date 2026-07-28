import { describe, it, expect } from "vitest";
import {
  SELECTION_SLOTS,
  OTHER_SLOT,
  defaultSelections,
  emptySelection,
  parseSelections,
  normaliseSelection,
  isFilled,
  selectionSummary,
  mergeWithSlots,
  selectionChips,
  filledProgress,
  slotLabel,
} from "./selections";

describe("defaultSelections", () => {
  it("gives one blank row per standard slot, in specification order", () => {
    const rows = defaultSelections();
    expect(rows).toHaveLength(SELECTION_SLOTS.length);
    expect(rows.map((r) => r.slot)).toEqual(SELECTION_SLOTS.map((s) => s.key));
    expect(rows.every((r) => !isFilled(r))).toBe(true);
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
  });
});

describe("normaliseSelection", () => {
  it("trims strings, defaults the slot, and keeps an id when present", () => {
    const entry = normaliseSelection(
      { id: "sel1", slot: "door", brand: "  Polytec  ", code: "", colour: "Classic White", position: 3 },
      0
    );
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("sel1");
    expect(entry!.brand).toBe("Polytec");
    expect(entry!.label).toBe("Doors"); // filled in from the slot definition
    expect(entry!.position).toBe(3);
  });

  it("falls back to the 'other' slot and the array index", () => {
    const entry = normaliseSelection({ colour: "Sage" }, 5);
    expect(entry!.slot).toBe(OTHER_SLOT);
    expect(entry!.position).toBe(5);
    expect(entry!.label).toBe("");
  });

  it("rejects rows that aren't objects", () => {
    expect(normaliseSelection(null, 0)).toBeNull();
    expect(normaliseSelection("door", 0)).toBeNull();
  });
});

describe("parseSelections", () => {
  it("drops junk rows and survives a non-array body", () => {
    expect(parseSelections([{ slot: "door" }, null, 7, { slot: "hinges" }])).toHaveLength(2);
    expect(parseSelections("nope")).toEqual([]);
    expect(parseSelections(undefined)).toEqual([]);
  });

  it("coerces unexpected field types to empty strings rather than throwing", () => {
    const [entry] = parseSelections([{ slot: "door", brand: 42, notes: { a: 1 }, photoId: null }]);
    expect(entry.brand).toBe("");
    expect(entry.notes).toBe("");
    expect(entry.photoId).toBeNull();
  });
});

describe("isFilled", () => {
  it("is false for a blank row and true once any field says something", () => {
    const blank = emptySelection("door", "Doors", 0);
    expect(isFilled(blank)).toBe(false);
    expect(isFilled({ ...blank, notes: "TBC with client" })).toBe(true);
  });

  it("ignores a photo on its own — a swatch is not a decision", () => {
    const blank = emptySelection("door", "Doors", 0);
    expect(isFilled({ ...blank, photoId: "doc1" })).toBe(false);
  });
});

describe("selectionSummary", () => {
  it("reads product, then look, then supplier", () => {
    const entry = {
      ...emptySelection("benchtop", "Benchtop", 0),
      brand: "Caesarstone",
      code: "4011",
      colour: "Cloudburst",
      finish: "20mm honed",
      supplier: "Stone Co",
    };
    expect(selectionSummary(entry)).toBe("Caesarstone 4011 · Cloudburst, 20mm honed · Stone Co");
  });

  it("leaves notes out and skips missing parts cleanly", () => {
    const entry = { ...emptySelection("hinges", "Hinges", 0), brand: "Blum", notes: "order 40 extra" };
    expect(selectionSummary(entry)).toBe("Blum");
  });

  it("is empty for a blank row", () => {
    expect(selectionSummary(emptySelection("door", "Doors", 0))).toBe("");
  });
});

describe("mergeWithSlots", () => {
  it("adds slots the stored set is missing without touching what was saved", () => {
    const stored = parseSelections([{ slot: "door", brand: "Polytec", colour: "Classic White" }]);
    const merged = mergeWithSlots(stored);
    expect(merged).toHaveLength(SELECTION_SLOTS.length);
    expect(merged.find((m) => m.slot === "door")!.brand).toBe("Polytec");
    expect(merged.filter(isFilled)).toHaveLength(1);
  });

  it("keeps custom rows, after the standard ones, in their stored order", () => {
    const stored = parseSelections([
      { slot: OTHER_SLOT, label: "Wine fridge trim", brand: "Vintec", position: 2 },
      { slot: OTHER_SLOT, label: "Pantry shelving", brand: "Custom", position: 1 },
      { slot: "handles", brand: "Kethy" },
    ]);
    const merged = mergeWithSlots(stored);
    expect(merged).toHaveLength(SELECTION_SLOTS.length + 2);
    const extras = merged.slice(SELECTION_SLOTS.length);
    expect(extras.map((e) => e.label)).toEqual(["Pantry shelving", "Wine fridge trim"]);
    expect(extras.map((e) => e.position)).toEqual([SELECTION_SLOTS.length, SELECTION_SLOTS.length + 1]);
  });

  it("keeps the first of a duplicated standard slot and demotes the rest", () => {
    const stored = parseSelections([
      { slot: "door", brand: "Polytec" },
      { slot: "door", brand: "Laminex" },
    ]);
    const merged = mergeWithSlots(stored);
    expect(merged.filter((m) => m.slot === "door")).toHaveLength(2);
    expect(merged[0].brand).toBe("Polytec"); // the standard row
    expect(merged[merged.length - 1].brand).toBe("Laminex"); // demoted to an extra
  });

  it("renumbers positions so the saved order is the displayed order", () => {
    const merged = mergeWithSlots(parseSelections([{ slot: "runners", position: 99 }]));
    expect(merged.map((m) => m.position)).toEqual(merged.map((_, i) => i));
  });
});

describe("selectionChips", () => {
  it("shows only decided rows, labelled", () => {
    const rows = mergeWithSlots(
      parseSelections([
        { slot: "door", brand: "Polytec", colour: "Classic White" },
        { slot: OTHER_SLOT, label: "Wine fridge trim", brand: "Vintec" },
      ])
    );
    const chips = selectionChips(rows);
    expect(chips.map((c) => c.label)).toEqual(["Doors", "Wine fridge trim"]);
    expect(chips[0].summary).toBe("Polytec · Classic White");
  });

  it("is empty when nothing has been chosen yet", () => {
    expect(selectionChips(defaultSelections())).toEqual([]);
  });
});

describe("filledProgress", () => {
  it("counts standard slots only, so a custom row can't push it past the total", () => {
    const rows = mergeWithSlots(
      parseSelections([
        { slot: "door", brand: "Polytec" },
        { slot: "handles", brand: "Kethy" },
        { slot: OTHER_SLOT, label: "Wine fridge trim", brand: "Vintec" },
      ])
    );
    expect(filledProgress(rows)).toEqual({ done: 2, total: SELECTION_SLOTS.length });
  });
});

describe("slotLabel", () => {
  it("prefers the row's own label, falls back to the slot, then to Other", () => {
    expect(slotLabel(emptySelection("door", "", 0))).toBe("Doors");
    expect(slotLabel(emptySelection("door", "Overhead doors", 0))).toBe("Overhead doors");
    expect(slotLabel(emptySelection(OTHER_SLOT, "", 0))).toBe("Other");
  });
});

import { describe, it, expect } from "vitest";
import {
  lineTotalCents,
  computeQuoteTotals,
  dollarsToCents,
  centsToDollars,
  parseSections,
  flattenForPdf,
  type QuoteSection,
} from "./quote";

describe("cents conversion", () => {
  it("rounds dollars to whole cents", () => {
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(dollarsToCents(19.995)).toBe(2000); // half-cent rounds up
    expect(centsToDollars(1234)).toBe(12.34);
  });
});

describe("lineTotalCents", () => {
  it("multiplies quantity by unit and rounds once", () => {
    expect(lineTotalCents({ description: "x", quantity: 3, unitAmount: 10 })).toBe(3000);
    expect(lineTotalCents({ description: "x", quantity: 2.5, unitAmount: 19.99 })).toBe(4998); // 49.975 -> 49.98
    expect(lineTotalCents({ description: "x", quantity: 0, unitAmount: 100 })).toBe(0);
  });
});

describe("computeQuoteTotals", () => {
  const sections: QuoteSection[] = [
    { title: "Cabinetry", lines: [{ description: "Base unit", quantity: 6, unitAmount: 320 }] },
    {
      title: "Install",
      lines: [
        { description: "Fit hours", quantity: 12, unitAmount: 85 },
        { description: "Handles", quantity: 18, unitAmount: 12.5 },
      ],
    },
  ];

  it("computes an exact, cents-accurate breakdown with margin and GST", () => {
    // lines: 6*320 + 12*85 + 18*12.5 = 1920 + 1020 + 225 = 3165.00 -> 316500c
    const t = computeQuoteTotals(sections, 15);
    expect(t.linesCents).toBe(316500);
    // margin 15% of 316500 = 47475c
    expect(t.marginCents).toBe(47475);
    expect(t.subtotalCents).toBe(363975);
    // GST 10% of 363975 = 36397.5 -> 36398 (round half up)
    expect(t.taxCents).toBe(36398);
    expect(t.totalCents).toBe(400373);
  });

  it("is a no-op margin when zero", () => {
    const t = computeQuoteTotals(sections, 0);
    expect(t.marginCents).toBe(0);
    expect(t.subtotalCents).toBe(t.linesCents);
    expect(t.taxCents).toBe(31650);
    expect(t.totalCents).toBe(348150);
  });

  it("handles fractional quantities without accumulating rounding error", () => {
    const s: QuoteSection[] = [
      { title: "", lines: [
        { description: "a", quantity: 0.333, unitAmount: 100 }, // 33.30
        { description: "b", quantity: 0.333, unitAmount: 100 }, // 33.30
        { description: "c", quantity: 0.334, unitAmount: 100 }, // 33.40
      ] },
    ];
    // sum = (0.333+0.333+0.334)*100 = 100.00 exactly -> 10000c
    const t = computeQuoteTotals(s, 0);
    expect(t.linesCents).toBe(10000);
    expect(t.totalCents).toBe(11000);
  });

  it("treats an empty quote as zero", () => {
    const t = computeQuoteTotals([], 20);
    expect(t).toEqual({ linesCents: 0, marginCents: 0, subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });
});

describe("parseSections", () => {
  it("round-trips valid JSON and drops junk", () => {
    const raw = JSON.stringify([
      { title: "A", lines: [{ description: "x", quantity: 2, unitAmount: 5 }, { bad: true }] },
      { nope: 1 },
      "garbage",
    ]);
    const parsed = parseSections(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ title: "A", lines: [{ description: "x", quantity: 2, unitAmount: 5 }] });
    expect(parsed[1]).toEqual({ title: "", lines: [] });
  });

  it("returns [] for empty or malformed input", () => {
    expect(parseSections(null)).toEqual([]);
    expect(parseSections("not json")).toEqual([]);
    expect(parseSections("{}")).toEqual([]);
  });
});

describe("flattenForPdf", () => {
  const sections: QuoteSection[] = [
    { title: "Cabinetry", lines: [{ description: "Base unit", quantity: 2, unitAmount: 100 }] },
  ];

  it("emits a section header, the lines, and a margin line", () => {
    const flat = flattenForPdf(sections, 10);
    expect(flat[0]).toEqual({ description: "Cabinetry", quantity: 0, unitAmount: 0, isSection: true });
    expect(flat[1]).toEqual({ description: "Base unit", quantity: 2, unitAmount: 100 });
    expect(flat[2].description).toBe("Margin (10%)");
    expect(flat[2].unitAmount).toBe(20); // 10% of $200
  });

  it("the flattened lines' dollar maths reproduce the cents totals exactly", () => {
    // The PDF sums these dollar lines then rounds; that must equal our cents math.
    const flat = flattenForPdf(sections, 10);
    const sumDollars = flat.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
    const subtotalCents = Math.round(sumDollars * 100);
    const totals = computeQuoteTotals(sections, 10);
    expect(subtotalCents).toBe(totals.subtotalCents);
  });

  it("omits the margin line when there is no margin", () => {
    const flat = flattenForPdf(sections, 0);
    expect(flat.some((l) => l.description.startsWith("Margin"))).toBe(false);
  });
});

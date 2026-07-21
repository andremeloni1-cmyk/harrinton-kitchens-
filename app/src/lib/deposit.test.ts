import { describe, it, expect } from "vitest";
import { clampPercent, depositLineCents, depositLineItem } from "./deposit";
import { computeTotals } from "./invoices";

describe("clampPercent", () => {
  it("clamps into 0..100 and defaults junk to 0", () => {
    expect(clampPercent(30)).toBe(30);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(NaN)).toBe(0);
  });
});

describe("depositLineCents", () => {
  it("takes a percentage of the ex-GST subtotal, rounded to cents", () => {
    expect(depositLineCents(100000, 50)).toBe(50000); // $500 of $1000
    expect(depositLineCents(455344, 30)).toBe(136603); // 136603.2 -> 136603
    expect(depositLineCents(33333, 33.33)).toBe(11110); // 11109.9789 -> 11110
  });

  it("clamps the percentage and handles the extremes", () => {
    expect(depositLineCents(100000, 0)).toBe(0);
    expect(depositLineCents(100000, 100)).toBe(100000);
    expect(depositLineCents(100000, 200)).toBe(100000);
  });
});

describe("depositLineItem → invoice total", () => {
  it("the deposit invoice total lands on the same % of the quote's GST-inclusive total", () => {
    // Quote: subtotal $4553.44 ex GST, total $5008.78 inc GST (from the P4.2 example).
    const quoteSubtotalCents = 455344;
    const quoteTotalCents = 500878;
    const line = depositLineItem(quoteSubtotalCents, 30, "Deposit (30%)");
    expect(line.unitAmount).toBe(1366.03);

    // The invoice re-adds 10% GST to the deposit line.
    const totals = computeTotals([line]);
    expect(totals.subtotal).toBe(1366.03);
    expect(totals.total).toBeCloseTo(1502.63, 2);

    // Within a cent of 30% of the quote's inclusive total.
    const thirtyPctOfTotal = (quoteTotalCents * 0.3) / 100; // 1502.634
    expect(Math.abs(totals.total - thirtyPctOfTotal)).toBeLessThan(0.01);
  });
});

import { describe, it, expect } from "vitest";
import { finalInvoiceLines, finalInvoiceBalanceCents, finalInvoiceTotalDollars, paymentsCreditLine, contractLinesFromQuote } from "./handover";
import { computeTotals, type LineItem } from "./invoices";
import { computeQuoteTotals, parseSections } from "./quote";

const base: LineItem[] = [{ description: "Kitchen — contract", quantity: 1, unitAmount: 10000 }]; // $10,000 ex-GST
const approvedVar = [{ status: "approved", amountCents: 400000, title: "Extra pantry" }]; // +$4,000 ex-GST
const declinedVar = [{ status: "declined", amountCents: 999999, title: "nope" }];

describe("handover final invoice math", () => {
  it("bills contract + approved variations − deposit, GST-correct", () => {
    // contract ex = 10000 + 4000 = 14000; inc = 15400; less $3,300 deposit → $12,100
    const paid = 330000; // $3,300 inc-GST
    expect(finalInvoiceBalanceCents(1_000_000, approvedVar, paid)).toBe(1_210_000);
    const lines = finalInvoiceLines(base, approvedVar, paid);
    expect(finalInvoiceTotalDollars(lines)).toBe(12100);
  });

  it("ignores non-approved variations", () => {
    expect(finalInvoiceBalanceCents(1_000_000, declinedVar, 0)).toBe(1_100_000); // just base inc-GST
  });

  it("bills the full contract when nothing has been paid", () => {
    const lines = finalInvoiceLines(base, approvedVar, 0);
    expect(lines.some((l) => l.unitAmount < 0)).toBe(false); // no credit line
    expect(finalInvoiceTotalDollars(lines)).toBe(15400);
  });

  it("the credit line nets exactly to the balance through computeTotals", () => {
    const paid = 330000;
    const lines = finalInvoiceLines(base, approvedVar, paid);
    const { total } = computeTotals(lines);
    expect(Math.round(total * 100)).toBe(finalInvoiceBalanceCents(1_000_000, approvedVar, paid));
  });

  it("credit line is null when nothing is paid, present otherwise", () => {
    expect(paymentsCreditLine(0)).toBe(null);
    expect(paymentsCreditLine(110000)?.unitAmount).toBe(-1000); // $1,100 inc → $1,000 ex credit
  });

  it("handles a fully-paid contract (balance zero)", () => {
    // contract inc = 15400 → paid 15400 → balance 0
    expect(finalInvoiceBalanceCents(1_000_000, approvedVar, 1_540_000)).toBe(0);
  });
});

describe("contractLinesFromQuote (P0-8 — bill the accepted quote, not the estimate)", () => {
  const sections = [{ title: "Cabinetry", lines: [{ description: "Base cabinets", quantity: 10, unitAmount: 200 }] }]; // $2,000 ex

  it("itemises the quote lines + a margin line summing to the quote's ex-GST subtotal", () => {
    const quote = { sections: JSON.stringify(sections), marginPct: 10 };
    const lines = contractLinesFromQuote(quote);
    const { subtotalCents } = computeQuoteTotals(parseSections(quote.sections), quote.marginPct);
    const summedCents = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0) * 100);
    expect(summedCents).toBe(subtotalCents); // 2000 + 10% margin = 2200 → 220000c
    expect(lines.some((l) => /Margin/.test(l.description))).toBe(true);
  });

  it("omits the margin line when margin is 0", () => {
    const lines = contractLinesFromQuote({ sections: JSON.stringify(sections), marginPct: 0 });
    expect(lines.some((l) => /Margin/.test(l.description))).toBe(false);
    expect(Math.round(lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0) * 100)).toBe(200000);
  });
});

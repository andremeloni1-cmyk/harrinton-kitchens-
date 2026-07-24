import { computeTotals, type LineItem } from "./invoices";
import { variationLineItems, approvedVariationCents, type VariationLike } from "./variation";
import { parseSections, computeQuoteTotals, centsToDollars } from "./quote";

// Handover math + templates (P10.4). The final invoice bills the balance of the
// agreed contract (base + approved variations) after payments already received
// (deposit / progress claims). All pure so the money is unit-tested.

export const CARE_INSTRUCTIONS: string[] = [
  "Wipe surfaces with a soft, damp cloth and mild detergent — avoid abrasive or solvent-based cleaners.",
  "Dry any spills promptly, especially around joins, sinks and the dishwasher.",
  "Don't sit or stand on drawers, doors or benchtops.",
  "Adjust hinges seasonally as timber moves; we can show you how or come back to do it.",
  "Keep steam appliances and kettles away from door and panel edges.",
];

export const WARRANTY_TERMS: string[] = [
  "Cabinetry and workmanship are warranted for 7 years from handover against defects in materials and manufacture.",
  "Hardware (hinges, runners, handles) carries the manufacturer's warranty, typically lifetime for soft-close mechanisms.",
  "Benchtops are warranted per the material supplier's terms, provided by request.",
  "The warranty excludes fair wear and tear, misuse, or damage from water, heat or accident.",
  "Warranty service is arranged through the maintenance request on your client portal.",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Base invoice lines derived from the contract the client actually accepted (a
 * Quote's sections + margin), so the final invoice bills the signed amount, not
 * the pre-sales estimate. The line dollar-amounts come straight from the quote;
 * the caller should still use the quote's stored `subtotalCents` for the
 * balance so the money stays cents-exact against what was accepted.
 */
export function contractLinesFromQuote(quote: { sections: string; marginPct: number }): LineItem[] {
  const sections = parseSections(quote.sections);
  const lines: LineItem[] = [];
  for (const s of sections) {
    for (const l of s.lines) {
      lines.push({
        description: s.title ? `${s.title} — ${l.description}` : l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
      });
    }
  }
  const { marginCents } = computeQuoteTotals(sections, quote.marginPct);
  if (marginCents !== 0) {
    lines.push({
      description: quote.marginPct ? `Margin (${quote.marginPct}%)` : "Margin",
      quantity: 1,
      unitAmount: centsToDollars(marginCents),
    });
  }
  return lines;
}

/** The ex-GST credit line that nets a fresh invoice down to the outstanding
 * balance, given the inc-GST amount already invoiced to the client (deposit /
 * progress claims). Null when there is nothing to credit. */
export function paymentsCreditLine(paidIncCents: number, taxRate = 0.1): LineItem | null {
  if (paidIncCents <= 0) return null;
  return {
    description: "Less deposit / progress claims already invoiced",
    quantity: 1,
    unitAmount: -round2(paidIncCents / 100 / (1 + taxRate)),
  };
}

/** Final invoice line items: contract base + approved variations − payments. */
export function finalInvoiceLines(baseLines: LineItem[], variations: VariationLike[], paidIncCents: number, taxRate = 0.1): LineItem[] {
  const credit = paymentsCreditLine(paidIncCents, taxRate);
  return [...baseLines, ...variationLineItems(variations), ...(credit ? [credit] : [])];
}

/** The outstanding balance (inc-GST cents) billed at handover:
 * (base + approved variations) × (1 + GST) − payments received. */
export function finalInvoiceBalanceCents(baseSubtotalCents: number, variations: VariationLike[], paidIncCents: number, taxRate = 0.1): number {
  const subtotalCents = Math.max(0, baseSubtotalCents) + approvedVariationCents(variations);
  const contractIncCents = Math.round(subtotalCents * (1 + taxRate));
  return contractIncCents - Math.max(0, paidIncCents);
}

/** Convenience: the invoice total (inc-GST dollars) a set of final lines yields. */
export function finalInvoiceTotalDollars(lines: LineItem[], taxRate = 0.1): number {
  return computeTotals(lines, taxRate).total;
}

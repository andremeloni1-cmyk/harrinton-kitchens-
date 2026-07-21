// Deposit-invoice maths (P4.3). A deposit is a percentage of the accepted
// quote's ex-GST subtotal; the deposit invoice re-adds GST, so its grand total
// lands on the same percentage of the quote's GST-inclusive total.

import { centsToDollars } from "./quote";
import type { LineItem } from "./invoices";

export function clampPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** The deposit's ex-GST value in cents: pct% of the quote's ex-GST subtotal. */
export function depositLineCents(quoteSubtotalCents: number, pct: number): number {
  const cents = Number.isFinite(quoteSubtotalCents) ? quoteSubtotalCents : 0;
  return Math.round((cents * clampPercent(pct)) / 100);
}

/** A single deposit line (dollars) ready for createInvoiceFromJob. */
export function depositLineItem(quoteSubtotalCents: number, pct: number, label: string): LineItem {
  return {
    description: label,
    quantity: 1,
    unitAmount: centsToDollars(depositLineCents(quoteSubtotalCents, pct)),
  };
}

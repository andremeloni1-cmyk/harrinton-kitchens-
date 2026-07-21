// Quote maths and shapes. Line amounts are entered in dollars (matching the
// price list, estimates and invoices), but every total is computed and stored
// in integer cents so a quote can never drift by a rounding cent — the numbers
// the client accepts are the numbers that become the deposit invoice.

// One quote line — same shape as an invoice/estimate line so price-list picks
// and AI suggestions drop straight in.
export type QuoteLine = {
  description: string;
  quantity: number;
  unitAmount: number; // dollars, ex GST
};

// Lines are grouped into named sections (e.g. "Cabinetry", "Installation").
export type QuoteSection = {
  title: string;
  lines: QuoteLine[];
};

// The wire shape sent to the builder — sections parsed, totals in cents.
export type QuoteDTO = {
  id: string;
  jobId: string;
  version: number;
  status: string;
  currency: string;
  sections: QuoteSection[];
  marginPct: number;
  notes: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Serialise a stored quote row (dates → ISO, sections JSON → array).
export function serializeQuoteRow(row: {
  id: string;
  jobId: string;
  version: number;
  status: string;
  currency: string;
  sections: string;
  marginPct: number;
  notes: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): QuoteDTO {
  return {
    id: row.id,
    jobId: row.jobId,
    version: row.version,
    status: row.status,
    currency: row.currency,
    sections: parseSections(row.sections),
    marginPct: row.marginPct,
    notes: row.notes,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type QuoteTotals = {
  linesCents: number; // sum of the lines, before margin
  marginCents: number; // margin applied to the line subtotal
  subtotalCents: number; // linesCents + marginCents, ex GST
  taxCents: number; // GST on the subtotal
  totalCents: number; // grand total, inc GST
};

// Australian GST. Kept a constant (not per-quote) — it matches the invoices and
// the existing quote PDF, and quotes here are always domestic.
export const GST_RATE = 0.1;

export function dollarsToCents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * A single line's total in cents. The unit price is snapped to exact cents
 * first, so the quantity multiply is the only rounding — this makes the printed
 * line totals sum to the subtotal (no floating $19.99 drift).
 */
export function lineTotalCents(line: QuoteLine): number {
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  return Math.round(qty * dollarsToCents(line.unitAmount));
}

/**
 * Totals for a whole quote, in integer cents. The line subtotal is the sum of
 * the rounded line totals (so the itemised lines always add up to it); margin
 * and GST each round once.
 */
export function computeQuoteTotals(sections: QuoteSection[], marginPct: number): QuoteTotals {
  const margin = Number.isFinite(marginPct) ? marginPct : 0;
  let linesCents = 0;
  for (const s of sections) {
    for (const l of s.lines) linesCents += lineTotalCents(l);
  }
  const marginCents = Math.round((linesCents * margin) / 100);
  const subtotalCents = linesCents + marginCents;
  const taxCents = Math.round(subtotalCents * GST_RATE);
  const totalCents = subtotalCents + taxCents;
  return { linesCents, marginCents, subtotalCents, taxCents, totalCents };
}

// --- JSON (de)serialisation ------------------------------------------------

function normalizeLine(raw: unknown): QuoteLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.description !== "string") return null;
  return {
    description: r.description,
    quantity: typeof r.quantity === "number" && Number.isFinite(r.quantity) ? r.quantity : 0,
    unitAmount: typeof r.unitAmount === "number" && Number.isFinite(r.unitAmount) ? r.unitAmount : 0,
  };
}

/** Parse the stored sections JSON into a safe, well-formed structure. */
export function parseSections(raw: string | null | undefined): QuoteSection[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((s): QuoteSection | null => {
      if (!s || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const lines = Array.isArray(r.lines) ? r.lines.map(normalizeLine).filter((l): l is QuoteLine => l !== null) : [];
      return { title: typeof r.title === "string" ? r.title : "", lines };
    })
    .filter((s): s is QuoteSection => s !== null);
}

/**
 * Flatten sections into the flat line list the quote PDF renders: a bold
 * section-header row before each section's lines, and a trailing margin line so
 * the PDF's own subtotal/GST maths land on exactly the computed cents totals.
 */
export function flattenForPdf(
  sections: QuoteSection[],
  marginPct: number
): { description: string; quantity: number; unitAmount: number; isSection?: boolean }[] {
  const out: { description: string; quantity: number; unitAmount: number; isSection?: boolean }[] = [];
  for (const s of sections) {
    if (s.lines.length === 0) continue;
    if (s.title.trim()) out.push({ description: s.title, quantity: 0, unitAmount: 0, isSection: true });
    for (const l of s.lines) {
      out.push({ description: l.description, quantity: l.quantity, unitAmount: l.unitAmount });
    }
  }
  const { marginCents } = computeQuoteTotals(sections, marginPct);
  if (marginCents !== 0) {
    out.push({
      description: `Margin${marginPct ? ` (${marginPct}%)` : ""}`,
      quantity: 1,
      unitAmount: centsToDollars(marginCents),
    });
  }
  return out;
}

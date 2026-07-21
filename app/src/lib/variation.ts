// Discrepancy detection for the check-measure → variation hook (P5.4). Compares
// the dimensions actually measured on site against the dimensions the quote
// assumed, so scope changes surface as a drafted variation. Pure and testable.

import type { CheckMeasureData } from "./measure";

export type Discrepancy = { note: string };

// Pull millimetre values out of free text — matches an explicit unit (mm/cm/m)
// so it doesn't mistake prices or quantities for dimensions. "3.6m" → 3600,
// "2400mm" → 2400, "90 cm" → 900.
export function extractMm(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]);
    if (!Number.isFinite(value)) continue;
    const unit = m[2].toLowerCase();
    const mm = unit === "mm" ? value : unit === "cm" ? value * 10 : value * 1000;
    out.push(Math.round(mm));
  }
  return out;
}

/** Every real millimetre value captured across the measured rooms. */
export function capturedMm(measure: CheckMeasureData): number[] {
  const out: number[] = [];
  for (const room of measure.rooms) {
    if (room.ceilingMm != null) out.push(room.ceilingMm);
    for (const w of room.walls) if (w.mm != null) out.push(w.mm);
    for (const o of room.openings) if (o.mm != null) out.push(o.mm);
  }
  return out;
}

const nearest = (target: number, values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), values[0]);

/**
 * Discrepancies between the measure and the quote's assumed dimensions. Each
 * dimension the quote mentions that the measure doesn't match (within
 * toleranceMm) is flagged. If the quote listed no dimensions, that itself is
 * flagged so the office confirms scope. Returns [] when nothing was measured.
 */
export function findDiscrepancies(
  measure: CheckMeasureData,
  quoteText: string,
  toleranceMm = 50
): Discrepancy[] {
  if (measure.rooms.length === 0) return [];
  const captured = capturedMm(measure);
  if (captured.length === 0) return [];

  const quoted = [...new Set(extractMm(quoteText || ""))];
  if (quoted.length === 0) {
    return [{
      note: "The quote listed no dimensions to check against — confirm the measured space still matches the quoted scope.",
    }];
  }

  const out: Discrepancy[] = [];
  for (const q of quoted) {
    const near = nearest(q, captured);
    if (near == null || Math.abs(near - q) > toleranceMm) {
      out.push({
        note:
          near == null
            ? `Quote references ${q}mm, but nothing similar was measured.`
            : `Quote references ${q}mm, but the closest measured dimension is ${near}mm (${Math.abs(near - q)}mm off).`,
      });
    }
    if (out.length >= 8) break; // keep the list actionable
  }
  return out;
}

// --- Variation money (P6.4) -----------------------------------------------
// Amounts are ex-GST integer cents (a variation can be a credit — negative).

type VariationLike = { status: string; title: string; amountCents: number };

/** Total ex-GST cents of the approved variations only. */
export function approvedVariationCents(variations: VariationLike[]): number {
  return variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + (Number.isFinite(v.amountCents) ? v.amountCents : 0), 0);
}

/** The job's contract value: the base (accepted quote) plus approved variations. */
export function contractTotalCents(baseCents: number, variations: VariationLike[]): number {
  return (Number.isFinite(baseCents) ? baseCents : 0) + approvedVariationCents(variations);
}

/** Approved variations as invoice/quote line items (dollars, ex GST). */
export function variationLineItems(variations: VariationLike[]): { description: string; quantity: number; unitAmount: number }[] {
  return variations
    .filter((v) => v.status === "approved")
    .map((v) => ({ description: `Variation: ${v.title}`, quantity: 1, unitAmount: v.amountCents / 100 }));
}

/** A drafted variation's title + body from a discrepancy list. */
export function variationDraftFrom(discrepancies: Discrepancy[]): { title: string; description: string } {
  return {
    title: "Scope variation from check measure",
    description:
      "Raised automatically from check-measure discrepancies — price and send for approval:\n\n" +
      discrepancies.map((d) => `• ${d.note}`).join("\n"),
  };
}

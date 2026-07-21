import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { computeQuoteTotals, parseSections, serializeQuoteRow } from "@/lib/quote";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; quoteId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, quoteId } = await params;
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, jobId: id } });
  if (!quote) return json({ error: "not found" }, 404);
  return json({ quote: serializeQuoteRow(quote) });
}

// Edit a quote's content. Sections/margin/notes are re-normalised and the cents
// totals recomputed server-side, so the stored figures are always authoritative.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, quoteId } = await params;
  const existing = await prisma.quote.findFirst({ where: { id: quoteId, jobId: id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const sections =
    "sections" in body
      ? parseSections(typeof body.sections === "string" ? body.sections : JSON.stringify(body.sections))
      : parseSections(existing.sections);
  const marginPct = "marginPct" in body ? Number(body.marginPct) || 0 : existing.marginPct;
  const notes = "notes" in body ? (body.notes ? String(body.notes).slice(0, 2000) : null) : existing.notes;
  const totals = computeQuoteTotals(sections, marginPct);

  const quote = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      sections: JSON.stringify(sections),
      marginPct,
      notes,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
  });
  return json({ quote: serializeQuoteRow(quote) });
}

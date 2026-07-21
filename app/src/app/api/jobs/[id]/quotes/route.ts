import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { parseLineItems } from "@/lib/invoices";
import { computeQuoteTotals, parseSections, serializeQuoteRow, type QuoteSection } from "@/lib/quote";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// All quote versions for a job, newest first.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const quotes = await prisma.quote.findMany({ where: { jobId }, orderBy: { version: "desc" } });
  return json({ quotes: quotes.map(serializeQuoteRow) });
}

// Create a new draft version, seeded from the latest quote or — first time — the
// job's component estimate.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);

  const latest = await prisma.quote.findFirst({ where: { jobId }, orderBy: { version: "desc" } });

  let sections: QuoteSection[];
  let marginPct: number;
  if (latest) {
    sections = parseSections(latest.sections);
    marginPct = latest.marginPct;
  } else {
    const estimate = parseLineItems(job.estimateItems ?? "[]");
    sections = estimate.length
      ? [{ title: "Estimate", lines: estimate.map((l) => ({ description: l.description, quantity: l.quantity, unitAmount: l.unitAmount })) }]
      : [{ title: "Cabinetry & installation", lines: [] }];
    marginPct = 0;
  }
  const totals = computeQuoteTotals(sections, marginPct);
  const version = (latest?.version ?? 0) + 1;

  const quote = await prisma.quote.create({
    data: {
      jobId,
      version,
      currency: job.currency || "AUD",
      sections: JSON.stringify(sections),
      marginPct,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
  });
  await logActivity(jobId, "note", `Quote v${version} drafted`);
  return json({ quote: serializeQuoteRow(quote) }, 201);
}

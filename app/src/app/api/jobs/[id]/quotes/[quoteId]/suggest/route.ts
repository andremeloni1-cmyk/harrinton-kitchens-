import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { suggestInvoiceLines } from "@/lib/invoice-ai";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; quoteId: string }> };

// AI line suggestions for a quote: match the job against the price list and
// return a ready-to-add section. Reuses the invoice suggestion engine (the job's
// company rate card), so a quote never gets another builder's components.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return json({ error: "not found" }, 404);

  const items = await prisma.priceItem.findMany({ where: { active: true } });
  const lines = await suggestInvoiceLines(job, items);

  if (!lines || lines.length === 0) {
    return json({
      section: null,
      message:
        lines === null
          ? "AI suggestions aren’t available — add ANTHROPIC_API_KEY and some price-list items."
          : "No confident matches from the price list for this job yet.",
    });
  }
  return json({ section: { title: "Suggested items", lines } });
}

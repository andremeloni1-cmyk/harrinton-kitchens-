import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { visionConfigured } from "@/lib/vision";
import { suggestInvoiceLines } from "@/lib/invoice-ai";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** AI-suggest invoice lines from the linked job's description + price list.
 * Returns the lines for the editor to append — does not save. */
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const invoice = await prisma.invoice.findUnique({
    where: { id: (await params).id },
    include: { job: true },
  });
  if (!invoice) return json({ error: "not found" }, 404);
  if (!invoice.job) return json({ error: "This invoice isn't linked to a job." }, 400);
  if (!visionConfigured()) {
    return json({ error: "AI isn't configured — add ANTHROPIC_API_KEY to suggest lines." }, 400);
  }

  const items = await prisma.priceItem.findMany({ where: { active: true } });
  if (items.length === 0) {
    return json({ error: "Add some items to your price list first." }, 400);
  }
  const lines = await suggestInvoiceLines(invoice.job, items);
  if (lines === null) return json({ error: "Couldn't suggest lines just now." }, 502);
  return json({ lines });
}

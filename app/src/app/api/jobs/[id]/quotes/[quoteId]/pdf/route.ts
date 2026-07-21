import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { buildQuotePdf } from "@/lib/quote-pdf";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; quoteId: string }> };

// Render a branded quote-pack PDF for the office.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, quoteId } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return json({ error: "not found" }, 404);
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, jobId: id } });
  if (!quote) return json({ error: "not found" }, 404);

  const result = await buildQuotePdf(job, quote).catch((e) => {
    console.error("quote PDF generation failed:", e);
    return { error: "Couldn't build the quote PDF." };
  });
  if (!Buffer.isBuffer(result)) return json({ error: result.error }, 400);

  await logActivity(id, "note", `Quote v${quote.version} PDF generated`);
  return json({ pdfBase64: result.toString("base64"), filename: `Quote-${job.reference}-v${quote.version}.pdf` });
}

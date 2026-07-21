import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { buildQuotePdf } from "@/lib/quote-pdf";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ quoteId: string }> };

// The client views their own quote's PDF. Scoped to the portal session's client.
export async function POST(_req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { quoteId } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, job: { clientId: portal.id }, status: { in: ["sent", "accepted", "changes_requested"] } },
    include: { job: true },
  });
  if (!quote) return json({ error: "not found" }, 404);

  const result = await buildQuotePdf(quote.job, quote).catch(() => ({ error: "Couldn't build the PDF." }));
  if (!Buffer.isBuffer(result)) return json({ error: result.error }, 400);
  return json({ pdfBase64: result.toString("base64"), filename: `Quote-${quote.job.reference}-v${quote.version}.pdf` });
}

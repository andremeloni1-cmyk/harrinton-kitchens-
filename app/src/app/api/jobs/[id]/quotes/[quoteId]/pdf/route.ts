import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { generateQuotePdf } from "@/lib/pdf";
import { computeQuoteTotals, parseSections, flattenForPdf, centsToDollars } from "@/lib/quote";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; quoteId: string }> };

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// Render a branded quote-pack PDF: sectioned line items, cents-exact totals, and
// the job's drawings/renders appended as full-page images.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, quoteId } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return json({ error: "not found" }, 404);
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, jobId: id } });
  if (!quote) return json({ error: "not found" }, 404);

  const sections = parseSections(quote.sections);
  const flat = flattenForPdf(sections, quote.marginPct);
  if (flat.filter((l) => !l.isSection).length === 0) {
    return json({ error: "Add some lines to the quote before building the PDF." }, 400);
  }
  const totals = computeQuoteTotals(sections, quote.marginPct);

  const settings = await prisma.companySettings.findFirst();
  const source = job.companyId
    ? await prisma.leadSource.findUnique({ where: { id: job.companyId } })
    : null;
  const billTo = source ? (source.displayName || source.name).trim() : job.clientName;
  const now = new Date();
  const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const logoB64 = settings?.logoDark || settings?.logo;
  const logoMime = settings?.logoDark ? settings?.logoDarkMime : settings?.logoMime;

  // Drawings / renders appendix — the job's uploaded images (PNG/JPEG only).
  const docs = await prisma.document.findMany({ where: { jobId: id } });
  const appendixImages = docs
    .filter((d) => d.fileData && /image\/(png|jpe?g)/.test(d.mimeType))
    .slice(0, 12)
    .map((d) => ({ base64: d.fileData!, mime: d.mimeType, caption: d.name }));

  let pdf: Buffer;
  try {
    pdf = await generateQuotePdf(
      {
        quoteNumber: `${job.reference}-Q${quote.version}`,
        jobTitle: job.title,
        reference: job.reference,
        billTo,
        siteContact: job.companyId ? job.clientName : null,
        address: job.address,
        ownerName: settings?.name,
        currency: quote.currency,
        quoteDate: fmtDate(now),
        validUntil: fmtDate(validUntil),
        notes: quote.notes,
        logo: logoB64 ? { base64: logoB64, mime: logoMime || "image/png" } : null,
        totals: {
          subtotal: centsToDollars(totals.subtotalCents),
          tax: centsToDollars(totals.taxCents),
          total: centsToDollars(totals.totalCents),
        },
        appendixImages,
      },
      flat
    );
  } catch (e) {
    console.error("quote PDF generation failed:", e);
    return json({ error: "Couldn't build the quote PDF." }, 500);
  }

  await logActivity(id, "note", `Quote v${quote.version} PDF generated`);
  return json({ pdfBase64: pdf.toString("base64"), filename: `Quote-${job.reference}-v${quote.version}.pdf` });
}

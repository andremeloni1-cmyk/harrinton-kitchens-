// Server-side quote-pack PDF builder, shared by the office and portal PDF
// routes so both render an identical, cents-exact, branded document.
import { prisma } from "./db";
import { generateQuotePdf } from "./pdf";
import { computeQuoteTotals, parseSections, flattenForPdf, centsToDollars } from "./quote";
import type { Job, Quote } from "@prisma/client";

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function buildQuotePdf(job: Job, quote: Quote): Promise<Buffer | { error: string }> {
  const sections = parseSections(quote.sections);
  const flat = flattenForPdf(sections, quote.marginPct);
  if (flat.filter((l) => !l.isSection).length === 0) {
    return { error: "Add some lines to the quote before building the PDF." };
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

  const docs = await prisma.document.findMany({ where: { jobId: job.id } });
  const appendixImages = docs
    .filter((d) => d.fileData && /image\/(png|jpe?g)/.test(d.mimeType))
    .slice(0, 12)
    .map((d) => ({ base64: d.fileData!, mime: d.mimeType, caption: d.name }));

  return generateQuotePdf(
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
}

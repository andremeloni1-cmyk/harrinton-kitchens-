import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { generateQuotePdf, type QuoteLine } from "@/lib/pdf";
import { parseLineItems } from "@/lib/invoices";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Build a quote PDF for a job. Lines come from the component estimate; if none
 * exists, a single line from the job's quote amount. Returns the PDF bytes for
 * an immediate download/share (nothing is saved — a quote is a snapshot).
 */
export async function POST(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  const estimate = parseLineItems(job.estimateItems ?? "[]");
  const lines: QuoteLine[] =
    estimate.length > 0
      ? estimate.map((l) => ({ description: l.description, quantity: l.quantity, unitAmount: l.unitAmount }))
      : [
          {
            description: [job.title, job.address].filter(Boolean).join(" · ") || "Kitchen installation",
            quantity: 1,
            unitAmount: job.quoteAmount ?? 0,
          },
        ];

  if (lines.every((l) => l.quantity * l.unitAmount === 0)) {
    return json(
      { error: "Add an estimate or a quote amount to this job before building a quote." },
      400
    );
  }

  const account = await prisma.companySettings.findFirst();
  const source = job.companyId
    ? await prisma.leadSource.findUnique({ where: { id: job.companyId } })
    : null;
  const billTo = source ? (source.displayName || source.name).trim() : job.clientName;

  const now = new Date();
  const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const logoB64 = account?.logoDark || account?.logo;
  const logoMime = account?.logoDark ? account?.logoDarkMime : account?.logoMime;

  let pdf: Buffer;
  try {
    pdf = await generateQuotePdf(
      {
        quoteNumber: job.reference,
        jobTitle: job.title,
        reference: job.reference,
        billTo,
        siteContact: job.companyId ? job.clientName : null,
        address: job.address,
        ownerName: account?.name,
        currency: job.currency || "AUD",
        quoteDate: fmtDate(now),
        validUntil: fmtDate(validUntil),
        logo: logoB64 ? { base64: logoB64, mime: logoMime || "image/png" } : null,
      },
      lines
    );
  } catch (e) {
    console.error("quote PDF generation failed:", e);
    return json({ error: "Couldn't build the quote PDF." }, 500);
  }

  await logActivity(job.id, "note", "Quote PDF generated");
  return json({ pdfBase64: pdf.toString("base64"), filename: `Quote-${job.reference}.pdf` });
}

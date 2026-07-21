import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, type PipelineStage } from "@/lib/pipeline";
import { createInvoiceFromJob, pushInvoiceToXero } from "@/lib/invoices";
import { depositLineItem } from "@/lib/deposit";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ quoteId: string }> };

// The client accepts their quote with a typed-name signature: recorded in an
// Approval, the quote is accepted, the job advances to DEPOSIT (firing its stage
// side effects) and a deposit invoice is auto-drafted at the configured percent.
export async function POST(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { quoteId } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, job: { clientId: portal.id } },
    include: { job: true },
  });
  if (!quote) return json({ error: "not found" }, 404);
  if (quote.status === "accepted") return json({ error: "This quote has already been accepted." }, 400);

  const body = await req.json().catch(() => ({}));
  const signerName = String(body.signerName || "").trim();
  if (signerName.length < 2) return json({ error: "Please type your full name to accept." }, 400);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  await prisma.approval.create({
    data: { jobId: quote.jobId, quoteId: quote.id, kind: "quote", decision: "accepted", signerName, ip },
  });
  await prisma.quote.update({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: new Date() } });

  // Advance the job to DEPOSIT and run its stage side effects.
  const fromStage = quote.job.pipelineStage as PipelineStage;
  const job = await prisma.job.update({
    where: { id: quote.jobId },
    data: { pipelineStage: "DEPOSIT", status: legacyStatusForStage("DEPOSIT") },
  });
  await runStageTransition(job, fromStage, "DEPOSIT", { logTransition: true }).catch(() => {});

  // Auto-draft the deposit invoice at the configured percent (Xero draft when
  // connected; local otherwise).
  const settings = await prisma.companySettings.findFirst();
  const pct = settings?.depositPercent ?? 30;
  let invoiceOut: { number: string; total: number; currency: string } | null = null;
  try {
    const line = depositLineItem(quote.subtotalCents, pct, `Deposit (${pct}%) — ${job.reference} ${job.title}`);
    const created = await createInvoiceFromJob(job, { lineItems: [line] });
    await pushInvoiceToXero(created.id, "DRAFT").catch(() => {});
    const fresh = await prisma.invoice.findUnique({ where: { id: created.id } });
    if (fresh) invoiceOut = { number: fresh.number, total: fresh.total, currency: fresh.currency };
  } catch (e) {
    console.error("deposit invoice failed:", e);
  }

  await logActivity(quote.jobId, "note", `Quote v${quote.version} accepted by ${signerName}`);
  await sendPush({
    title: `${BRAND.name} — quote accepted`,
    body: `${signerName} accepted the quote for ${job.title}`,
    url: `/jobs/${job.id}`,
  }).catch(() => {});

  return json({ ok: true, invoice: invoiceOut });
}

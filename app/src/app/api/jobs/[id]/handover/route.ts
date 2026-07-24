import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { createInvoiceFromJob, parseLineItems, type LineItem } from "@/lib/invoices";
import { finalInvoiceLines, finalInvoiceBalanceCents, contractLinesFromQuote, CARE_INSTRUCTIONS, WARRANTY_TERMS } from "@/lib/handover";
import { generateHandoverPdf } from "@/lib/handover-pdf";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Run the handover ceremony (P10.4): record the client's on-site sign-off, build
// and share the handover pack, move the job to HANDOVER, and draft the final
// balance invoice (contract + approved variations − payments received).
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("field_app");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const signerName = String(body.signerName || "").trim();
  if (signerName.length < 2) return json({ error: "Type the client's name to sign off." }, 400);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const signaturePngBase64 = typeof body.signatureData === "string" && body.signatureData.startsWith("data:image")
    ? body.signatureData.split(",")[1] || null
    : null;

  const [settings, drawingSets, snags, variations, invoices, acceptedQuote] = await Promise.all([
    prisma.companySettings.findFirst({ select: { name: true } }),
    prisma.drawingSet.findMany({ where: { jobId }, select: { name: true, revisions: { where: { status: { in: ["released", "approved"] } }, orderBy: { createdAt: "desc" }, select: { label: true, documents: { select: { name: true } } } } } }),
    prisma.snagItem.findMany({ where: { jobId }, select: { status: true } }),
    prisma.variation.findMany({ where: { jobId } }),
    prisma.invoice.findMany({ where: { jobId }, select: { status: true, total: true } }),
    prisma.quote.findFirst({ where: { jobId, status: "accepted" }, orderBy: { acceptedAt: "desc" } }),
  ]);

  // 1) sign-off
  await prisma.approval.create({ data: { jobId, kind: "handover", decision: "accepted", signerName, ip } });

  // 2) handover pack PDF
  const drawings = drawingSets.flatMap((s) => s.revisions.flatMap((r) => r.documents.map((d) => d.name || `${s.name} ${r.label}`)));
  const snagDone = snags.filter((s) => s.status === "resolved").length;
  const companyName = settings?.name || BRAND.name;
  const pdf = await generateHandoverPdf({
    companyName, jobReference: job.reference, jobTitle: job.title, clientName: job.clientName, address: job.address,
    drawings, snags: { done: snagDone, total: snags.length },
    careInstructions: CARE_INSTRUCTIONS, warranty: WARRANTY_TERMS,
    signerName, signedAt: new Date(), signaturePngBase64,
  }).catch((e) => { console.error("handover pdf failed", e); return null; });

  if (pdf) {
    await prisma.document.create({
      data: { jobId, name: `Handover pack — ${job.reference}.pdf`, source: "handover", mimeType: "application/pdf", fileData: pdf.toString("base64"), sharedWithClient: true },
    });
  }

  // 3) advance to HANDOVER (forward only)
  const from = job.pipelineStage as PipelineStage;
  if (stageIndex(from) >= 0 && stageIndex(from) < stageIndex("HANDOVER")) {
    const j2 = await prisma.job.update({ where: { id: jobId }, data: { pipelineStage: "HANDOVER", status: legacyStatusForStage("HANDOVER") } });
    // This route drafts the final balance invoice itself (below), so suppress the
    // HANDOVER stage's own draft_invoice effect to avoid a duplicate.
    await runStageTransition(j2, from, "HANDOVER", { logTransition: true, skipEffects: ["draft_invoice"] }).catch(() => {});
  }

  // 4) draft the final balance invoice.
  // Credit amounts already invoiced to the client (deposit / progress claims) by
  // their invoice TOTAL — never draft or voided — so an authorised-but-unpaid
  // deposit is still credited and the client is never billed >100% of contract.
  const creditedIncCents = Math.round(
    invoices
      .filter((i) => i.status !== "draft" && i.status !== "voided")
      .reduce((s, i) => s + (i.total || 0), 0) * 100
  );

  // Bill the contract the client actually accepted (latest accepted quote),
  // falling back to the job's estimate / quote amount only when there's no quote.
  let baseLines: LineItem[];
  let baseSubtotalCents: number;
  if (acceptedQuote) {
    baseLines = contractLinesFromQuote(acceptedQuote);
    baseSubtotalCents = acceptedQuote.subtotalCents; // cents-exact accepted contract
  } else {
    const estimate = parseLineItems(job.estimateItems ?? "[]");
    baseLines =
      estimate.length > 0
        ? estimate
        : [{ description: [`${job.reference} — ${job.title}`, job.address].filter(Boolean).join(" · "), quantity: 1, unitAmount: job.quoteAmount ?? 0 }];
    baseSubtotalCents = Math.round(baseLines.reduce((s, l) => s + l.quantity * l.unitAmount, 0) * 100);
  }
  const finalLines = finalInvoiceLines(baseLines, variations, creditedIncCents);
  const invoice = await createInvoiceFromJob(job, { lineItems: finalLines }).catch((e) => { console.error("final invoice failed", e); return null; });
  const balanceCents = finalInvoiceBalanceCents(baseSubtotalCents, variations, creditedIncCents);

  await logActivity(jobId, "note", `Handover signed by ${signerName}. Final invoice ${invoice ? invoice.number : "draft"} — balance $${(balanceCents / 100).toFixed(2)}.`);

  if (job.clientEmail) {
    await sendEmail({
      to: job.clientEmail,
      subject: `Handover pack & warranty — ${job.title}`,
      body: `Hi ${job.clientName || "there"},\n\nCongratulations — your kitchen is complete! Your handover pack (approved drawings, care guide and warranty) is in your client portal.\n\nThank you for choosing ${companyName}.`,
    }).catch(() => {});
  }

  return json({
    ok: true,
    pdfBase64: pdf ? pdf.toString("base64") : null,
    filename: `Handover-${job.reference}.pdf`,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.number ?? null,
    balance: balanceCents / 100,
  });
}

import { prisma } from "@/lib/db";
import { parseLineItems, isOverdue, syncInvoiceStatuses } from "@/lib/invoices";
import { generateQuotePdf, type QuoteLine } from "@/lib/pdf";
import { sendEmail } from "@/lib/google/gmail";
import { isGoogleConnected } from "@/lib/google/oauth";
import { isXeroConnected } from "@/lib/xero/oauth";
import { renderTemplate } from "@/lib/email-templates";
import { logActivity } from "@/lib/automations";
import { BRAND } from "@/lib/brand";

// Emailing an invoice, and chasing one that has gone past its due date.
//
// Ported from JoineryFlow, adapted to this schema: money here is stored in
// dollars as floats rather than integer cents, company settings live on
// CompanySettings rather than Account, and there is no per-company billing
// address — an invoice goes to the job's client email.

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const fmtMoney = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};

/**
 * Where an invoice or reminder is sent: the client record's own address when
 * there is one, otherwise the job's site contact. Pure, so the precedence is
 * testable without a database.
 */
export function invoiceRecipient(clientEmail?: string | null, jobContactEmail?: string | null): string {
  return clientEmail?.trim() || jobContactEmail?.trim() || "";
}

/** The invoice plus the job/company context needed to render or send it. */
async function loadInvoiceContext(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  const job = invoice.jobId ? await prisma.job.findUnique({ where: { id: invoice.jobId } }) : null;
  const client = invoice.clientId
    ? await prisma.client.findUnique({ where: { id: invoice.clientId } })
    : null;
  const source = job?.companyId
    ? await prisma.leadSource.findUnique({ where: { id: job.companyId } })
    : null;
  const settings = await prisma.companySettings.findFirst();
  const billTo = source ? (source.displayName || source.name).trim() : client?.name || job?.clientName || null;
  const recipient = invoiceRecipient(client?.email, job?.clientEmail);
  return { invoice, job, client, settings, billTo, recipient };
}

/**
 * The tax-invoice PDF. Reuses the quote layout in its TAX INVOICE variant, so
 * the two documents can't drift apart visually.
 */
export async function buildInvoicePdf(
  invoiceId: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  const ctx = await loadInvoiceContext(invoiceId);
  if (!ctx) return null;
  const { invoice, job, settings, billTo } = ctx;

  const items = parseLineItems(invoice.lineItems);
  const lines: QuoteLine[] =
    items.length > 0
      ? items.map((l) => ({ description: l.description, quantity: l.quantity, unitAmount: l.unitAmount }))
      : [{ description: job?.title || invoice.reference || "Joinery work", quantity: 1, unitAmount: invoice.subtotal }];

  const logoB64 = settings?.logoDark || settings?.logo;
  const logoMime = settings?.logoDark ? settings?.logoDarkMime : settings?.logoMime;
  const ownerName = settings?.name || BRAND.name;

  const pdf = await generateQuotePdf(
    {
      docType: "TAX INVOICE",
      quoteNumber: invoice.xeroNumber || invoice.number,
      jobTitle: job?.title || invoice.reference || "Joinery work",
      reference: invoice.reference || job?.reference || invoice.number,
      billTo,
      siteContact: job?.companyId ? job?.clientName : null,
      address: job?.address,
      ownerName,
      abn: settings?.abn,
      paymentDetails: settings?.paymentDetails,
      currency: invoice.currency || "AUD",
      quoteDate: fmtDate(invoice.issueDate),
      validUntil: invoice.dueDate ? fmtDate(invoice.dueDate) : undefined,
      logo: logoB64 ? { base64: logoB64, mime: logoMime || "image/png" } : null,
      // The stored totals are authoritative — once pushed they are Xero's own
      // figures, and the PDF must show the same amount as the books.
      totals: { subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total },
    },
    lines
  );
  return { pdf, filename: `Invoice-${invoice.number}.pdf` };
}

/** Prefill for the "Email invoice" sheet — nothing is sent without it. */
export async function invoiceEmailDefaults(invoiceId: string) {
  const ctx = await loadInvoiceContext(invoiceId);
  if (!ctx) return null;
  const { invoice, job, settings, billTo, recipient } = ctx;
  const business = settings?.name || BRAND.name;
  const currency = invoice.currency || "AUD";
  const due = invoice.dueDate ? fmtDate(invoice.dueDate) : null;

  const body =
    `Hi ${billTo || "there"},\n\n` +
    `Please find attached invoice ${invoice.number} for ${fmtMoney(invoice.total, currency)}` +
    (due ? `, due ${due}` : "") +
    `.\n\n` +
    (job?.title ? `Work: ${job.title}\n` : "") +
    (job?.address ? `Site: ${job.address}\n` : "") +
    (settings?.paymentDetails ? `\nPayment details:\n${settings.paymentDetails}\n` : "") +
    `\nThank you,\n${business}` +
    (settings?.signature ? `\n\n${settings.signature}` : "");

  return {
    to: recipient,
    cc: settings?.email || "",
    subject: `Invoice ${invoice.number} from ${business}`,
    message: body,
    total: invoice.total,
    currency,
    alreadySent: invoice.sentAt ? invoice.sentAt.toISOString() : null,
    googleConnected: await isGoogleConnected(),
  };
}

/** Emails the invoice PDF from the connected Gmail. Throws user-facing errors. */
export async function emailInvoiceToClient(
  invoiceId: string,
  opts: { to: string; cc?: string; subject: string; message: string }
): Promise<{ sentAt: Date }> {
  if (!(await isGoogleConnected())) {
    throw new Error("Connect Google in Settings first — invoices are emailed from your Gmail.");
  }
  const to = (opts.to || "").trim();
  if (!to) throw new Error("Add a recipient email address to send this invoice.");

  const built = await buildInvoicePdf(invoiceId);
  if (!built) throw new Error("Invoice not found.");

  const ok = await sendEmail({
    to,
    cc: opts.cc?.trim() || undefined,
    subject: opts.subject?.trim() || "Invoice",
    body: opts.message || "",
    attachment: { filename: built.filename, data: built.pdf, mimeType: "application/pdf" },
  });
  if (!ok) throw new Error("Couldn't send the email — check the address and that Google is connected.");

  const sentAt = new Date();
  const invoice = await prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt } });
  await logActivity(invoice.jobId, "invoice", `Invoice ${invoice.number} emailed to ${to}`).catch(() => {});
  return { sentAt };
}

// ---------------------------------------------------------------------------
// Payment reminders. Preview and send are separate so the office can never fire
// a chasing email without seeing exactly what is going out.

// A second reminder inside this window is a double-tap or a retry, not a
// decision — refused server-side whatever the client shows.
const REMINDER_REPEAT_GUARD_MS = 2 * 60 * 1000;

export const REMINDER_TEMPLATE_KEY = "payment_reminder";

/** Prefill for the chase-payment sheet, from the editable template. */
export async function reminderEmailDefaults(invoiceId: string) {
  const ctx = await loadInvoiceContext(invoiceId);
  if (!ctx) return null;
  const { invoice, job, settings, billTo, recipient } = ctx;
  const currency = invoice.currency || "AUD";

  const rendered = await renderTemplate(REMINDER_TEMPLATE_KEY, {
    clientName: billTo || "there",
    invoiceNumber: invoice.xeroNumber || invoice.number,
    amountDue: fmtMoney(invoice.amountDue, currency),
    dueDate: invoice.dueDate ? fmtDate(invoice.dueDate) : "its due date",
    jobTitle: job?.title || invoice.reference || "the job",
    ownerName: settings?.name || BRAND.name,
  });
  if (!rendered) return null;

  // Bank details belong to the company, not the wording — appended here so
  // editing the template can't accidentally drop them.
  let message = rendered.body;
  if (settings?.paymentDetails) message += `\n\nPayment details:\n${settings.paymentDetails}`;
  if (settings?.signature) message += `\n\n${settings.signature}`;

  return {
    to: recipient,
    cc: settings?.email || "",
    subject: rendered.subject,
    message,
    attachmentName: `Invoice-${invoice.number}.pdf`,
    amountDue: invoice.amountDue,
    currency,
    overdue: isOverdue(invoice),
    lastRemindedAt: invoice.lastRemindedAt ? invoice.lastRemindedAt.toISOString() : null,
    googleConnected: await isGoogleConnected(),
  };
}

/**
 * Emails a payment reminder with the invoice attached.
 *
 * The guards are the point. Payment state is re-synced from Xero first,
 * unthrottled, because this is the one moment it matters — chasing someone who
 * paid an hour ago is worse than not chasing at all. Then it refuses if the
 * invoice is no longer overdue, and refuses a repeat inside the double-send
 * window.
 */
export async function sendPaymentReminder(
  invoiceId: string,
  opts: { to: string; cc?: string; subject: string; message: string }
): Promise<{ remindedAt: Date }> {
  if (!(await isGoogleConnected())) {
    throw new Error("Connect Google in Settings first — reminders are emailed from your Gmail.");
  }
  const to = (opts.to || "").trim();
  if (!to) throw new Error("Add a recipient email address to send this reminder.");

  // A sync failure falls through to local state rather than blocking the office.
  if (await isXeroConnected()) await syncInvoiceStatuses().catch(() => {});

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found.");
  if (!isOverdue(invoice)) throw new Error("This invoice is no longer overdue — nothing to chase.");
  if (invoice.lastRemindedAt && Date.now() - invoice.lastRemindedAt.getTime() < REMINDER_REPEAT_GUARD_MS) {
    throw new Error("A reminder for this invoice was just sent.");
  }

  const built = await buildInvoicePdf(invoiceId);
  if (!built) throw new Error("Invoice not found.");

  const ok = await sendEmail({
    to,
    cc: opts.cc?.trim() || undefined,
    subject: opts.subject?.trim() || `Payment reminder — invoice ${invoice.number}`,
    body: opts.message || "",
    attachment: { filename: built.filename, data: built.pdf, mimeType: "application/pdf" },
  });
  if (!ok) throw new Error("Couldn't send the email — check the address and that Google is connected.");

  const remindedAt = new Date();
  await prisma.invoice.update({ where: { id: invoiceId }, data: { lastRemindedAt: remindedAt } });
  await logActivity(
    invoice.jobId,
    "invoice",
    `Payment reminder for invoice ${invoice.number} emailed to ${to}`
  ).catch(() => {});
  return { remindedAt };
}

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Invoice, Job } from "@prisma/client";
import { logActivity } from "@/lib/automations";
import { findOrCreateClientForJob } from "@/lib/clients";
import { variationLineItems } from "@/lib/variation";
import { isXeroConnected } from "@/lib/xero/oauth";
import { findOrCreateContact } from "@/lib/xero/contacts";
import { pushInvoice, fetchInvoiceStates, setInvoiceStatus } from "@/lib/xero/invoices";
import { lineTotalCents } from "@/lib/quote";

export type LineItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
  taxType?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Line items are entered tax-exclusive; Xero owns the authoritative tax
 * calculation once pushed. The local default mirrors AU GST (10%). */
export const DEFAULT_TAX_RATE = 0.1;

export function computeTotals(
  items: LineItem[],
  taxRate: number = DEFAULT_TAX_RATE
): { subtotal: number; tax: number; total: number } {
  // Round each line to whole cents before summing (the same rule quote.ts's
  // lineTotalCents uses) so an invoice built from a quote can't disagree with it
  // by a rounding cent, and the printed lines always add up to the subtotal.
  const subtotalCents = items.reduce((sum, i) => sum + lineTotalCents(i), 0);
  const taxCents = Math.round(subtotalCents * taxRate);
  return {
    subtotal: subtotalCents / 100,
    tax: taxCents / 100,
    total: (subtotalCents + taxCents) / 100,
  };
}

export function parseLineItems(raw: string): LineItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  return [];
}

/** Next local invoice number, e.g. INV-1001 — highest existing + 1 so numbers
 * stay collision-free (same approach as job references). */
export async function nextInvoiceNumber(): Promise<string> {
  const all = await prisma.invoice.findMany({ select: { number: true } });
  let max = 1000;
  for (const inv of all) {
    const m = inv.number?.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${max + 1}`;
}

export function isOverdue(inv: {
  status: string;
  amountDue: number;
  dueDate: Date | string | null;
}): boolean {
  return (
    inv.status === "authorised" &&
    inv.amountDue > 0 &&
    Boolean(inv.dueDate) &&
    new Date(inv.dueDate as Date | string).getTime() < Date.now()
  );
}

const DUE_DAYS = 14;

export async function createInvoiceFromJob(
  job: Job,
  opts: { lineItems?: LineItem[]; issueDate?: Date; dueDate?: Date | null } = {}
): Promise<Invoice> {
  const client = await findOrCreateClientForJob(job);

  // Line priority: explicit lines (e.g. a deposit) → the job's component
  // estimate → one line from the quote amount. When not billing explicit lines,
  // approved variations are appended so the final invoice reflects the agreed
  // contract value.
  const estimate = parseLineItems(job.estimateItems ?? "[]");
  let lineItems: LineItem[];
  if (opts.lineItems && opts.lineItems.length > 0) {
    lineItems = opts.lineItems;
  } else {
    const base: LineItem[] =
      estimate.length > 0
        ? estimate
        : [
            {
              // Include the site so the company can identify the job on the invoice.
              description: [`${job.reference} — ${job.title}`, job.address].filter(Boolean).join(" · "),
              quantity: 1,
              unitAmount: job.quoteAmount ?? 0,
            },
          ];
    const variations = await prisma.variation.findMany({ where: { jobId: job.id } });
    lineItems = [...base, ...variationLineItems(variations)];
  }
  const { subtotal, tax, total } = computeTotals(lineItems);
  const issueDate = opts.issueDate ?? new Date();
  const dueDate =
    opts.dueDate !== undefined
      ? opts.dueDate
      : new Date(issueDate.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000);

  // nextInvoiceNumber() reads-then-writes, so two concurrent creates (a portal
  // auto-deposit racing an office invoice) can compute the same INV-N; the loser
  // hits a P2002 on the unique `number`. Retry with a recomputed number — the
  // same resilience createJobWithReference has — so an invoice is never silently
  // dropped.
  let invoice: Invoice | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      invoice = await prisma.invoice.create({
        data: {
          number: await nextInvoiceNumber(),
          jobId: job.id,
          clientId: client?.id ?? null,
          issueDate,
          dueDate,
          currency: job.currency || "AUD",
          lineItems: JSON.stringify(lineItems),
          subtotal,
          tax,
          total,
          amountDue: total,
          reference: job.reference,
        },
      });
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  await logActivity(job.id, "invoice", `Invoice ${invoice.number} created`, {
    invoiceId: invoice.id,
  });
  return invoice;
}

const XERO_STATUS_MAP: Record<string, string> = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  AUTHORISED: "authorised",
  PAID: "paid",
  VOIDED: "voided",
  DELETED: "voided",
};

/**
 * Pushes an invoice to Xero as DRAFT or AUTHORISED (creating or updating the
 * Xero copy) and persists the returned Xero state. Without a Xero connection,
 * DRAFT is a local no-op and AUTHORISED is an error — authorising only means
 * something once the invoice exists in the books.
 */
export async function pushInvoiceToXero(
  invoiceId: string,
  target: "DRAFT" | "AUTHORISED"
): Promise<Invoice> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) throw new Error("Invoice not found");

  if (!(await isXeroConnected())) {
    if (target === "AUTHORISED") throw new Error("Connect Xero in Settings first");
    return invoice; // local draft only
  }
  if (!invoice.client) throw new Error("Invoice has no client to invoice in Xero");

  const contactId = await findOrCreateContact(invoice.client);
  if (!contactId) throw new Error("Could not resolve the Xero contact");

  const state = await pushInvoice(invoice, contactId, target);
  if (!state) throw new Error("Xero did not return the invoice");

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: XERO_STATUS_MAP[state.status] ?? invoice.status,
      xeroInvoiceId: state.xeroInvoiceId,
      xeroContactId: contactId,
      xeroNumber: state.number || null,
      subtotal: state.subTotal,
      tax: state.totalTax,
      total: state.total,
      amountDue: state.amountDue,
      amountPaid: state.amountPaid,
      lastSyncedAt: new Date(),
    },
  });
  await logActivity(
    invoice.jobId,
    "invoice",
    target === "AUTHORISED"
      ? `Invoice ${invoice.number} authorised in Xero`
      : `Invoice ${invoice.number} pushed to Xero as draft`,
    { invoiceId: invoice.id, xeroInvoiceId: state.xeroInvoiceId }
  );
  return updated;
}

/** Deletes/voids the Xero copy of an invoice (drafts are deleted, authorised
 * unpaid invoices voided). Returns false when Xero is unreachable. */
export async function removeInvoiceFromXero(invoice: Invoice): Promise<boolean> {
  if (!invoice.xeroInvoiceId) return true;
  const status = invoice.status === "authorised" ? "VOIDED" : "DELETED";
  return setInvoiceStatus(invoice.xeroInvoiceId, status);
}

/**
 * The GST-inclusive contract value for a job, in cents: the latest accepted
 * Quote if there is one, otherwise the job's component estimate / quote amount.
 */
export async function jobContractIncCents(job: Job): Promise<number> {
  const acceptedQuote = await prisma.quote.findFirst({
    where: { jobId: job.id, status: "accepted" },
    orderBy: { acceptedAt: "desc" },
    select: { subtotalCents: true },
  });
  if (acceptedQuote) return Math.round(acceptedQuote.subtotalCents * (1 + DEFAULT_TAX_RATE));
  const estimate = parseLineItems(job.estimateItems ?? "[]");
  const baseSubtotal =
    estimate.length > 0
      ? estimate.reduce((s, l) => s + l.quantity * l.unitAmount, 0)
      : job.quoteAmount ?? 0;
  return Math.round(baseSubtotal * (1 + DEFAULT_TAX_RATE) * 100);
}

/**
 * Auto-draft on completion: draft the OUTSTANDING BALANCE — the contract minus
 * whatever has already been invoiced (any non-voided invoice, so a draft or
 * authorised deposit is netted off rather than duplicated). Completing a job
 * therefore always bills the remainder — even a deposit-only job completed via a
 * plain status/stage change — and re-completing is a no-op once the contract is
 * fully invoiced. Best-effort Xero draft push.
 */
export async function autoDraftInvoiceOnComplete(job: Job): Promise<void> {
  const priorInvoices = await prisma.invoice.findMany({
    where: { jobId: job.id, status: { not: "voided" } },
    select: { total: true },
  });
  const invoicedIncCents = Math.round(priorInvoices.reduce((s, i) => s + (i.total || 0), 0) * 100);
  const contractIncCents = await jobContractIncCents(job);
  const balanceIncCents = contractIncCents - invoicedIncCents;
  if (balanceIncCents <= 1) return; // already fully invoiced (or nothing to bill)

  // With no prior invoice the balance IS the whole contract, so draft the normal
  // itemised invoice; once a deposit exists, draft just the remaining balance.
  const invoice =
    invoicedIncCents > 0
      ? await createInvoiceFromJob(job, {
          lineItems: [
            {
              description: `Balance — ${job.reference} ${job.title}`.trim(),
              quantity: 1,
              unitAmount: round2(balanceIncCents / 100 / (1 + DEFAULT_TAX_RATE)),
            },
          ],
        })
      : await createInvoiceFromJob(job);

  const connected = await isXeroConnected();
  if (connected) {
    try {
      await pushInvoiceToXero(invoice.id, "DRAFT");
      return; // pushInvoiceToXero already logged the outcome
    } catch {
      /* fall through to the local-only note */
    }
  }
  await logActivity(
    job.id,
    "invoice",
    connected
      ? `Draft invoice ${invoice.number} created (Xero push failed — retry from Invoices)`
      : `Draft invoice ${invoice.number} created (connect Xero to sync)`,
    { invoiceId: invoice.id }
  );
}

/**
 * Pull-sync: refresh local status/amounts for every invoice that lives in
 * Xero and isn't in a terminal state. Stamps Account.xeroLastInvoiceSyncAt so
 * page-load syncs can be throttled.
 */
export async function syncInvoiceStatuses(): Promise<{ updated: number }> {
  const open = await prisma.invoice.findMany({
    where: { xeroInvoiceId: { not: null }, status: { notIn: ["paid", "voided"] } },
  });

  let updated = 0;
  if (open.length > 0) {
    const states = await fetchInvoiceStates(open.map((i) => i.xeroInvoiceId!));
    const byId = new Map(states.map((s) => [s.xeroInvoiceId, s]));

    for (const inv of open) {
      const state = byId.get(inv.xeroInvoiceId!);
      if (!state) continue;
      const status = XERO_STATUS_MAP[state.status] ?? inv.status;
      const changed =
        status !== inv.status ||
        state.amountPaid !== inv.amountPaid ||
        state.amountDue !== inv.amountDue ||
        state.total !== inv.total;
      if (!changed) continue;

      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          status,
          subtotal: state.subTotal,
          tax: state.totalTax,
          total: state.total,
          amountDue: state.amountDue,
          amountPaid: state.amountPaid,
          xeroNumber: state.number || inv.xeroNumber,
          lastSyncedAt: new Date(),
        },
      });
      if (status === "paid" && inv.status !== "paid") {
        await logActivity(inv.jobId, "invoice", `Invoice ${inv.number} paid`, {
          invoiceId: inv.id,
        });
      }
      updated++;
    }
  }

  const account = await prisma.companySettings.findFirst();
  if (account) {
    await prisma.companySettings.update({
      where: { id: account.id },
      data: { xeroLastInvoiceSyncAt: new Date() },
    });
  }
  return { updated };
}

import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import {
  computeTotals,
  isOverdue,
  pushInvoiceToXero,
  removeInvoiceFromXero,
  type LineItem,
} from "@/lib/invoices";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Only plain drafts are editable. A "submitted" invoice is awaiting approval in
// Xero — re-pushing it would post Status:DRAFT and silently revert that state,
// so those are locked here (edit them in Xero instead).
const EDITABLE = ["draft"];

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const invoice = await prisma.invoice.findUnique({
    where: { id: (await params).id },
    include: {
      job: { select: { id: true, reference: true, title: true, companyId: true } },
      client: { select: { id: true, name: true, email: true } },
    },
  });
  if (!invoice) return json({ error: "not found" }, 404);
  return json({ invoice: { ...invoice, overdue: isOverdue(invoice) } });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const existing = await prisma.invoice.findUnique({ where: { id: (await params).id } });
  if (!existing) return json({ error: "not found" }, 404);
  if (!EDITABLE.includes(existing.status)) {
    return json({ error: "Only draft invoices can be edited" }, 409);
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (Array.isArray(body.lineItems)) {
    const items: LineItem[] = body.lineItems
      .map((i: Partial<LineItem>) => ({
        description: String(i.description || ""),
        quantity: Number(i.quantity) || 0,
        unitAmount: Number(i.unitAmount) || 0,
      }))
      .filter((i: LineItem) => i.description || i.unitAmount);
    const totals = computeTotals(items);
    data.lineItems = JSON.stringify(items);
    data.subtotal = totals.subtotal;
    data.tax = totals.tax;
    data.total = totals.total;
    data.amountDue = totals.total - existing.amountPaid;
  }
  if ("issueDate" in body) data.issueDate = parseDate(body.issueDate) ?? existing.issueDate;
  if ("dueDate" in body) data.dueDate = parseDate(body.dueDate);
  if ("reference" in body) data.reference = body.reference || null;

  let invoice = await prisma.invoice.update({ where: { id: existing.id }, data });

  // Keep the Xero copy in step with local edits.
  if (invoice.xeroInvoiceId) {
    try {
      invoice = await pushInvoiceToXero(invoice.id, "DRAFT");
    } catch (e) {
      return json({
        invoice,
        warning: e instanceof Error ? e.message : "Xero update failed",
      });
    }
  }
  return json({ invoice });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const existing = await prisma.invoice.findUnique({ where: { id: (await params).id } });
  if (!existing) return json({ error: "not found" }, 404);

  if (existing.status === "paid") return json({ error: "Paid invoices cannot be deleted" }, 409);
  if (existing.status === "authorised" && existing.amountPaid > 0) {
    return json({ error: "Invoices with payments cannot be voided" }, 409);
  }

  if (existing.xeroInvoiceId) {
    try {
      await removeInvoiceFromXero(existing);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Could not remove the invoice in Xero" },
        502
      );
    }
  }

  if (existing.status === "authorised") {
    // Authorised invoices are financial records — void, don't erase.
    await prisma.invoice.update({
      where: { id: existing.id },
      data: { status: "voided", amountDue: 0 },
    });
    await logActivity(existing.jobId, "invoice", `Invoice ${existing.number} voided`, {
      invoiceId: existing.id,
    });
  } else {
    await prisma.invoice.delete({ where: { id: existing.id } });
    await logActivity(existing.jobId, "invoice", `Invoice ${existing.number} deleted`, {});
  }
  return json({ ok: true });
}

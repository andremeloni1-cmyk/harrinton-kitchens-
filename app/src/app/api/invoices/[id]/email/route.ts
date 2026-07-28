import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { invoiceEmailDefaults, emailInvoiceToClient } from "@/lib/invoice-email";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Prefill for the compose sheet — recipient, subject, message. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const defaults = await invoiceEmailDefaults((await params).id);
  if (!defaults) return json({ error: "not found" }, 404);
  return json(defaults);
}

/** Send the invoice PDF to the client from the linked Gmail. */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const id = (await params).id;
  const existing = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  try {
    const { sentAt } = await emailInvoiceToClient(id, {
      to: String(body.to || ""),
      cc: body.cc ? String(body.cc) : undefined,
      subject: String(body.subject || ""),
      message: String(body.message || ""),
    });
    return json({ ok: true, sentAt: sentAt.toISOString() });
  } catch (e) {
    // These are written to be read by the office — surface them verbatim.
    return json({ error: e instanceof Error ? e.message : "Couldn't send the invoice." }, 400);
  }
}

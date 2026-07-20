import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { pushInvoiceToXero } from "@/lib/invoices";
import { XeroApiError } from "@/lib/xero/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const existing = await prisma.invoice.findUnique({ where: { id: (await params).id } });
  if (!existing) return json({ error: "not found" }, 404);
  if (["paid", "voided"].includes(existing.status)) {
    return json({ error: `A ${existing.status} invoice cannot be pushed` }, 409);
  }

  const body = await req.json().catch(() => ({}));
  const target = body.authorise ? "AUTHORISED" : "DRAFT";

  try {
    const invoice = await pushInvoiceToXero(existing.id, target);
    return json({ invoice });
  } catch (e) {
    // Xero validation problems (e.g. invalid account code) are user-fixable —
    // surface them verbatim.
    if (e instanceof XeroApiError) return json({ error: e.message }, 422);
    return json({ error: e instanceof Error ? e.message : "push failed" }, 500);
  }
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { parseLineItems } from "@/lib/invoices";
import { isXeroConnected } from "@/lib/xero/oauth";
import { fetchOnlineInvoiceUrl } from "@/lib/xero/invoices";

export const dynamic = "force-dynamic";

// Infer a friendly kind from the invoice's lines (we don't store one).
function kindOf(lineItemsJson: string): string {
  const lines = parseLineItems(lineItemsJson);
  if (lines.some((l) => /less payments|balance on completion/i.test(l.description))) return "Final";
  if (lines.some((l) => /deposit/i.test(l.description))) return "Deposit";
  return "Progress claim";
}

// The signed-in client's invoices (P11.2). Statuses/amounts are whatever the
// office last synced from Xero, so this mirrors Xero after a sync. Draft invoices
// (not yet issued) are hidden.
export async function GET() {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "draft" },
      OR: [{ clientId: portal.id }, { job: { clientId: portal.id } }],
    },
    orderBy: { issueDate: "asc" },
  });

  const connected = await isXeroConnected();
  const out = await Promise.all(
    invoices.map(async (inv) => {
      let payUrl: string | null = null;
      if (connected && inv.xeroInvoiceId && inv.status === "authorised" && inv.amountDue > 0) {
        payUrl = await fetchOnlineInvoiceUrl(inv.xeroInvoiceId).catch(() => null);
      }
      return {
        id: inv.id,
        number: inv.xeroNumber || inv.number,
        kind: kindOf(inv.lineItems),
        status: inv.status,
        currency: inv.currency,
        total: inv.total,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        payUrl,
      };
    })
  );
  return json({ invoices: out });
}

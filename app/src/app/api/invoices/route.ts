import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { xeroConfigured, isXeroConnected } from "@/lib/xero/oauth";
import {
  createInvoiceFromJob,
  syncInvoiceStatuses,
  isOverdue,
  type LineItem,
} from "@/lib/invoices";

export const dynamic = "force-dynamic";

const SYNC_THROTTLE_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const { searchParams } = new URL(req.url);

  const connected = await isXeroConnected();

  // Opportunistic pull-sync on page load, throttled so browsing the invoices
  // page doesn't burn Xero rate limit.
  if (searchParams.get("sync") === "1" && connected) {
    const account = await prisma.account.findFirst();
    const last = account?.xeroLastInvoiceSyncAt?.getTime() ?? 0;
    if (Date.now() - last > SYNC_THROTTLE_MS) {
      await syncInvoiceStatuses().catch(() => {});
    }
  }

  const status = searchParams.get("status");
  const invoices = await prisma.invoice.findMany({
    where: status ? { status } : undefined,
    include: {
      job: { select: { id: true, reference: true, title: true, companyId: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({
    invoices: invoices.map((inv) => ({ ...inv, overdue: isOverdue(inv) })),
    xero: { configured: xeroConfigured(), connected },
  });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  if (!body.jobId) return json({ error: "jobId is required" }, 400);
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) return json({ error: "job not found" }, 404);

  const lineItems: LineItem[] | undefined = Array.isArray(body.lineItems)
    ? body.lineItems
        .map((i: Partial<LineItem>) => ({
          description: String(i.description || ""),
          quantity: Number(i.quantity) || 0,
          unitAmount: Number(i.unitAmount) || 0,
        }))
        .filter((i: LineItem) => i.description || i.unitAmount)
    : undefined;

  try {
    const invoice = await createInvoiceFromJob(job, {
      lineItems,
      issueDate: parseDate(body.issueDate) ?? undefined,
      dueDate: "dueDate" in body ? parseDate(body.dueDate) : undefined,
    });
    return json({ invoice });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "could not create invoice" }, 500);
  }
}

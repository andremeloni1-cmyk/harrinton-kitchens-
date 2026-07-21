import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { serializeQuoteRow } from "@/lib/quote";

export const dynamic = "force-dynamic";

// The signed-in client's quotes that have been sent to them, newest version per
// job first, with the deposit invoice attached once a quote is accepted.
export async function GET() {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const quotes = await prisma.quote.findMany({
    where: { status: { in: ["sent", "accepted", "changes_requested"] }, job: { clientId: portal.id } },
    orderBy: [{ jobId: "asc" }, { version: "desc" }],
    include: { job: { select: { id: true, reference: true, title: true } } },
  });

  const jobIds = [...new Set(quotes.map((q) => q.jobId))];
  const invoices = jobIds.length
    ? await prisma.invoice.findMany({
        where: { jobId: { in: jobIds } },
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, total: true, currency: true, jobId: true, status: true, amountDue: true },
      })
    : [];
  const invByJob = new Map<string, (typeof invoices)[number]>();
  for (const inv of invoices) if (inv.jobId && !invByJob.has(inv.jobId)) invByJob.set(inv.jobId, inv);

  return json({
    quotes: quotes.map((q) => ({
      ...serializeQuoteRow(q),
      job: q.job,
      invoice: q.status === "accepted" ? invByJob.get(q.jobId) ?? null : null,
    })),
  });
}

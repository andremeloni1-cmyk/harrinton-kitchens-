import { prisma } from "@/lib/db";
import { scheduleForWeek } from "@/lib/capacity-server";
import { parseLineItems } from "@/lib/invoices";
import { detectRisks, type RiskItem } from "@/lib/risk";
import { businessYMD } from "@/lib/business-day";

// Gathers the live inputs for the pure risk engine (P12.3).

const dayAge = (d: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));

export async function computeRisks(now = new Date()): Promise<RiskItem[]> {
  const today = businessYMD(now);
  const [schedule, sentQuotes, sentDrawings, openSnags, authorisedInvoices] = await Promise.all([
    scheduleForWeek(today),
    prisma.quote.findMany({ where: { status: "sent" }, select: { createdAt: true, job: { select: { title: true } } } }),
    prisma.drawingRevision.findMany({ where: { status: "sent" }, select: { label: true, createdAt: true, sentAt: true, drawingSet: { select: { job: { select: { title: true } } } } } }),
    prisma.snagItem.findMany({ where: { status: "open" }, select: { createdAt: true, job: { select: { title: true } } } }),
    prisma.invoice.findMany({ where: { status: "authorised", amountDue: { gt: 0 } }, select: { lineItems: true, issueDate: true, job: { select: { title: true } } } }),
  ]);

  const staleApprovals = [
    ...sentQuotes.map((q) => ({ label: `Quote for ${q.job?.title ?? "a job"}`, ageDays: dayAge(q.createdAt, now) })),
    ...sentDrawings.map((d) => ({ label: `${d.label} for ${d.drawingSet.job.title}`, ageDays: dayAge(d.sentAt ?? d.createdAt, now) })),
  ];
  const unpaidDeposits = authorisedInvoices
    .filter((i) => parseLineItems(i.lineItems).some((l) => /deposit/i.test(l.description)))
    .map((i) => ({ job: i.job?.title ?? "a job", ageDays: dayAge(i.issueDate, now) }));

  return detectRisks({
    overloadedStationDays: schedule.cells.filter((c) => c.overloaded).length,
    staleApprovals,
    unsignedQuotes: sentQuotes.length,
    agingSnags: openSnags.map((s) => ({ job: s.job.title, ageDays: dayAge(s.createdAt, now) })),
    unpaidDeposits,
  });
}

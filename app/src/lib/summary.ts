import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { isOverdue } from "@/lib/invoices";
import { BRAND } from "@/lib/brand";

// A plain end-of-week digest the owner emails to themselves: what got done,
// what was billed, what came in, and what's still owed.

export type WeeklySummary = {
  from: Date;
  to: Date;
  completed: { count: number; titles: string[] };
  invoiced: { count: number; total: number };
  paid: { count: number; total: number };
  overdue: { count: number; total: number };
};

export async function buildWeeklySummary(now = new Date()): Promise<WeeklySummary> {
  const to = now;
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [completedJobs, invoicesThisWeek, paidThisWeek, openInvoices] = await Promise.all([
    // Jobs finished in the window — keyed on the real completion time, not
    // updatedAt (any later edit would otherwise re-list an old job).
    prisma.job.findMany({
      where: { status: "completed", completedAt: { gte: from, lte: to } },
      select: { title: true, reference: true },
      orderBy: { completedAt: "desc" },
    }),
    // "Invoiced" = invoices actually raised (left draft), not the auto-drafts
    // every completed job produces.
    prisma.invoice.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { in: ["submitted", "authorised", "paid"] } },
      select: { total: true },
    }),
    // Payments recorded this week (status flipped to paid → updatedAt in window).
    prisma.invoice.findMany({
      where: { status: "paid", updatedAt: { gte: from, lte: to } },
      select: { total: true },
    }),
    // Everything that could be overdue right now.
    prisma.invoice.findMany({
      where: { status: "authorised", amountDue: { gt: 0 } },
      select: { amountDue: true, dueDate: true, status: true },
    }),
  ]);

  const overdue = openInvoices.filter((i) => isOverdue(i));

  return {
    from,
    to,
    completed: {
      count: completedJobs.length,
      titles: completedJobs.slice(0, 12).map((j) => j.title || j.reference),
    },
    invoiced: {
      count: invoicesThisWeek.length,
      total: invoicesThisWeek.reduce((a, i) => a + i.total, 0),
    },
    paid: {
      count: paidThisWeek.length,
      total: paidThisWeek.reduce((a, i) => a + i.total, 0),
    },
    overdue: {
      count: overdue.length,
      total: overdue.reduce((a, i) => a + i.amountDue, 0),
    },
  };
}

/** Formats the summary as a short, readable plain-text email body. `signName` is
 * the business name used in the sign-off (defaults to the platform brand). */
export function formatWeeklySummary(s: WeeklySummary, currency = "AUD", signName: string = BRAND.name): string {
  const dm = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const lines: string[] = [];
  lines.push(`Your week: ${dm(s.from)} – ${dm(s.to)}`);
  lines.push("");
  lines.push(`Jobs completed: ${s.completed.count}`);
  for (const t of s.completed.titles) lines.push(`   • ${t}`);
  if (s.completed.count > s.completed.titles.length) {
    lines.push(`   …and ${s.completed.count - s.completed.titles.length} more`);
  }
  lines.push("");
  lines.push(`Invoiced: ${s.invoiced.count} invoice(s), ${fmtMoney(s.invoiced.total, currency)}`);
  lines.push(`Paid this week: ${s.paid.count} invoice(s), ${fmtMoney(s.paid.total, currency)}`);
  lines.push("");
  if (s.overdue.count > 0) {
    lines.push(`⚠️ Overdue: ${s.overdue.count} invoice(s) owing ${fmtMoney(s.overdue.total, currency)} — worth chasing.`);
  } else {
    lines.push("No overdue invoices — all up to date. 👍");
  }
  lines.push("");
  lines.push(`— ${signName}`);
  return lines.join("\n");
}

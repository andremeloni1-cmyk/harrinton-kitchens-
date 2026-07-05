import { prisma } from "@/lib/db";

// Business analytics derived from invoices + jobs. All money is ex-secrets and
// auth-gated at the route. "Raised" = an invoice that's left draft.
const RAISED = ["submitted", "authorised", "paid"];

/** Australian financial year starts 1 July. */
export function fyStart(now = new Date()): Date {
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 6, 1);
}
function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
/** Start of the current AU BAS quarter (Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun). */
export function quarterStart(now = new Date()): Date {
  const m = now.getMonth();
  const startMonth = m - (m % 3); // 0,3,6,9 — calendar quarters align with BAS
  return new Date(now.getFullYear(), startMonth, 1);
}

export type CompanyStat = {
  companyId: string | null;
  name: string;
  invoiced: number; // raised, ex-GST subtotal
  paid: number;
  outstanding: number;
  jobs: number;
};

export type Insights = {
  summary: {
    invoicedThisMonth: number; // raised total (inc GST) this month
    paidThisMonth: number;
    outstanding: number; // total amountDue on authorised invoices
    overdue: number; // amountDue on overdue invoices
    invoicedFY: number;
    paidFY: number;
    avgJobValue: number;
    jobsCompletedFY: number;
  };
  perCompany: CompanyStat[];
  monthly: { label: string; invoiced: number; paid: number }[]; // last 6 months
  gst: {
    quarterLabel: string;
    quarterFrom: string;
    gstOnSalesQuarter: number; // 1A — GST collected on invoices raised this quarter
    salesExGstQuarter: number;
    gstOnSalesFY: number;
    gstOnPurchasesQuarter: number; // 1B — GST paid on receipts this quarter
    purchasesExGstQuarter: number;
    gstOnPurchasesFY: number;
    netGstQuarter: number; // 1A − 1B (positive = owe the ATO)
    expensesTracked: boolean; // any receipts captured at all
  };
};

export async function computeInsights(now = new Date()): Promise<Insights> {
  const [invoices, sources, completedJobs, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { not: "voided" } },
      select: {
        total: true, subtotal: true, tax: true, amountPaid: true, amountDue: true,
        status: true, issueDate: true, dueDate: true, jobId: true,
        job: { select: { companyId: true } },
      },
    }),
    prisma.leadSource.findMany({ select: { id: true, name: true, displayName: true } }),
    prisma.job.findMany({ where: { status: "completed", completedAt: { gte: fyStart(now) } }, select: { quoteAmount: true } }),
    prisma.expense.findMany({ where: { date: { gte: fyStart(now) } }, select: { gst: true, net: true, date: true } }),
  ]);

  const nameById = new Map(sources.map((s) => [s.id, (s.displayName || s.name).trim()]));
  const mStart = monthStart(now).getTime();
  const fy = fyStart(now).getTime();
  const qStart = quarterStart(now);
  const isRaised = (s: string) => RAISED.includes(s);
  const inMonth = (d: Date | string) => new Date(d).getTime() >= mStart;
  const inFY = (d: Date | string) => new Date(d).getTime() >= fy;
  const isOverdue = (i: { status: string; amountDue: number; dueDate: Date | string | null }) =>
    i.status === "authorised" && i.amountDue > 0 && !!i.dueDate && new Date(i.dueDate).getTime() < now.getTime();

  let invoicedThisMonth = 0, paidThisMonth = 0, outstanding = 0, overdue = 0, invoicedFY = 0, paidFY = 0;
  const perCompany = new Map<string, CompanyStat>();
  const bump = (companyId: string | null, patch: Partial<CompanyStat>) => {
    const key = companyId || "_none";
    const cur = perCompany.get(key) || {
      companyId, name: companyId ? nameById.get(companyId) || "Company" : "Direct / private", invoiced: 0, paid: 0, outstanding: 0, jobs: 0,
    };
    perCompany.set(key, {
      ...cur,
      invoiced: cur.invoiced + (patch.invoiced || 0),
      paid: cur.paid + (patch.paid || 0),
      outstanding: cur.outstanding + (patch.outstanding || 0),
    });
  };

  // Last 6 months buckets.
  const monthly: { label: string; invoiced: number; paid: number; key: string }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    monthly.push({ label: d.toLocaleDateString("en-GB", { month: "short" }), invoiced: 0, paid: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
  }
  const monthlyByKey = new Map(monthly.map((m) => [m.key, m]));

  let gstOnSalesQuarter = 0, salesExGstQuarter = 0, gstOnSalesFY = 0;

  for (const inv of invoices) {
    const raised = isRaised(inv.status);
    const companyId = inv.job?.companyId ?? null;
    if (raised) {
      if (inMonth(inv.issueDate)) invoicedThisMonth += inv.total;
      if (inFY(inv.issueDate)) { invoicedFY += inv.total; gstOnSalesFY += inv.tax; bump(companyId, { invoiced: inv.subtotal }); }
      if (new Date(inv.issueDate).getTime() >= qStart.getTime()) { gstOnSalesQuarter += inv.tax; salesExGstQuarter += inv.subtotal; }
      const mk = `${new Date(inv.issueDate).getFullYear()}-${new Date(inv.issueDate).getMonth()}`;
      const mb = monthlyByKey.get(mk); if (mb) mb.invoiced += inv.total;
    }
    // Payments: approximate the date with issueDate (no separate payment date stored).
    if (inv.amountPaid > 0) {
      if (inMonth(inv.issueDate)) paidThisMonth += inv.amountPaid;
      if (inFY(inv.issueDate)) { paidFY += inv.amountPaid; bump(companyId, { paid: inv.amountPaid }); }
      const mk = `${new Date(inv.issueDate).getFullYear()}-${new Date(inv.issueDate).getMonth()}`;
      const mb = monthlyByKey.get(mk); if (mb) mb.paid += inv.amountPaid;
    }
    if (inv.status === "authorised" && inv.amountDue > 0) { outstanding += inv.amountDue; bump(companyId, { outstanding: inv.amountDue }); }
    if (isOverdue(inv)) overdue += inv.amountDue;
  }

  // GST on purchases (1B): expenses are already filtered to this FY above.
  let gstOnPurchasesQuarter = 0, purchasesExGstQuarter = 0, gstOnPurchasesFY = 0;
  for (const e of expenses) {
    gstOnPurchasesFY += e.gst;
    if (new Date(e.date).getTime() >= qStart.getTime()) {
      gstOnPurchasesQuarter += e.gst;
      purchasesExGstQuarter += e.net;
    }
  }

  const jobsCompletedFY = completedJobs.length;
  const avgJobValue = jobsCompletedFY > 0
    ? completedJobs.reduce((s, j) => s + (j.quoteAmount || 0), 0) / jobsCompletedFY
    : 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    summary: { invoicedThisMonth, paidThisMonth, outstanding, overdue, invoicedFY, paidFY, avgJobValue, jobsCompletedFY },
    perCompany: [...perCompany.values()].sort((a, b) => b.invoiced - a.invoiced),
    monthly: monthly.map(({ label, invoiced, paid }) => ({ label, invoiced, paid })),
    gst: {
      quarterLabel: `${qStart.toLocaleDateString("en-GB", { month: "short" })}–${new Date(qStart.getFullYear(), qStart.getMonth() + 2, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`,
      quarterFrom: qStart.toISOString(),
      gstOnSalesQuarter, salesExGstQuarter, gstOnSalesFY,
      gstOnPurchasesQuarter: round2(gstOnPurchasesQuarter),
      purchasesExGstQuarter: round2(purchasesExGstQuarter),
      gstOnPurchasesFY: round2(gstOnPurchasesFY),
      netGstQuarter: round2(gstOnSalesQuarter - gstOnPurchasesQuarter),
      expensesTracked: expenses.length > 0,
    },
  };
}

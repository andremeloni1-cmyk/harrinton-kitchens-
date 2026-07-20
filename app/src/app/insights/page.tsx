"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/job";
import type { Insights } from "@/lib/insights";

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Insights>("/api/insights")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxMonthly = data ? Math.max(1, ...data.monthly.map((m) => Math.max(m.invoiced, m.paid))) : 1;

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Business insights</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">Your numbers this month, this quarter, and this financial year.</p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : !data ? (
        <EmptyState icon={<span className="text-2xl">📊</span>} title="No data yet" subtitle="Raise a few invoices and your insights will appear here." />
      ) : (
        <div className="space-y-5 pb-4">
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Invoiced this month" value={fmtMoney(data.summary.invoicedThisMonth)} />
            <Stat label="Paid this month" value={fmtMoney(data.summary.paidThisMonth)} tone="green" />
            <Stat label="Outstanding" value={fmtMoney(data.summary.outstanding)} tone={data.summary.outstanding > 0 ? "amber" : "stone"} />
            <Stat label="Overdue" value={fmtMoney(data.summary.overdue)} tone={data.summary.overdue > 0 ? "red" : "stone"} />
          </div>

          {/* This financial year */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">This financial year</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <YearStat label="Invoiced" value={fmtMoney(data.summary.invoicedFY)} />
              <YearStat label="Jobs done" value={String(data.summary.jobsCompletedFY)} />
              <YearStat label="Avg job" value={fmtMoney(data.summary.avgJobValue)} />
            </div>
          </div>

          {/* Monthly trend */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Last 6 months</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
              {data.monthly.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 90 }}>
                    <div className="w-2.5 rounded-t bg-brand-500" style={{ height: `${(m.invoiced / maxMonthly) * 90}px` }} title={`Invoiced ${fmtMoney(m.invoiced)}`} />
                    <div className="w-2.5 rounded-t bg-emerald-500" style={{ height: `${(m.paid / maxMonthly) * 90}px` }} title={`Paid ${fmtMoney(m.paid)}`} />
                  </div>
                  <span className="text-xs text-stone-400 dark:text-slate-500">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-center gap-4 text-xs text-stone-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> Invoiced</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Paid</span>
            </div>
          </div>

          {/* Per company */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">By company (this FY)</h2>
            {data.perCompany.length === 0 ? (
              <p className="text-sm text-stone-400 dark:text-slate-500">No invoiced work yet this year.</p>
            ) : (
              <div className="space-y-3">
                {data.perCompany.map((c) => (
                  <div key={c.companyId || c.name}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold text-stone-800 dark:text-slate-100">{c.name}</span>
                      <span className="text-sm font-semibold text-stone-900 tabular-nums dark:text-slate-100">{fmtMoney(c.invoiced)}</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-stone-500 dark:text-slate-400">
                      <span className="text-emerald-600 dark:text-emerald-400">Paid {fmtMoney(c.paid)}</span>
                      {c.outstanding > 0 && <span className="text-amber-600 dark:text-amber-400">Outstanding {fmtMoney(c.outstanding)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GST / BAS */}
          <div className="card p-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">GST / BAS summary</h2>
            <p className="mb-3 text-xs text-stone-400 dark:text-slate-500">
              GST collected on invoices raised. This quarter ({data.gst.quarterLabel}).
            </p>
            <div className="space-y-1.5 text-sm">
              <Row label="Sales (ex GST) this quarter" value={fmtMoney(data.gst.salesExGstQuarter)} />
              <Row label="GST on sales (1A)" value={fmtMoney(data.gst.gstOnSalesQuarter)} />
              <Row label="Purchases (ex GST) this quarter" value={fmtMoney(data.gst.purchasesExGstQuarter)} />
              <Row label="GST on purchases (1B)" value={fmtMoney(data.gst.gstOnPurchasesQuarter)} />
              <div className="flex items-baseline justify-between border-t border-stone-100 pt-2 dark:border-night-line">
                <span className="font-semibold text-stone-900 dark:text-slate-100">
                  {data.gst.netGstQuarter >= 0 ? "Net GST to pay" : "GST refund"}
                </span>
                <span className={`text-xl font-bold tabular-nums ${data.gst.netGstQuarter >= 0 ? "text-stone-900 dark:text-slate-100" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {fmtMoney(Math.abs(data.gst.netGstQuarter))}
                </span>
              </div>
              <Row label="GST on sales this FY" value={fmtMoney(data.gst.gstOnSalesFY)} muted />
              <Row label="GST on purchases this FY" value={fmtMoney(data.gst.gstOnPurchasesFY)} muted />
            </div>
            <p className="mt-3 text-xs text-stone-400 dark:text-slate-500">
              {data.gst.expensesTracked
                ? "1B comes from your captured receipts. Always confirm against Xero before lodging your BAS."
                : "Capture receipts under Money → Receipts to fill in GST on purchases (1B). Always confirm against Xero before lodging."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "stone" }: { label: string; value: string; tone?: "stone" | "green" | "amber" | "red" }) {
  const color = {
    stone: "text-stone-900 dark:text-slate-100",
    green: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  }[tone];
  return (
    <div className="card p-3.5">
      <p className="text-xs text-stone-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
function YearStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-stone-900 tabular-nums dark:text-slate-100">{value}</p>
      <p className="text-xs text-stone-400 dark:text-slate-500">{label}</p>
    </div>
  );
}
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${muted ? "text-stone-400 dark:text-slate-500" : "text-stone-600 dark:text-slate-300"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

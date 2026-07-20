"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { MoneyTabs } from "@/components/MoneyTabs";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/job";

type PnlRow = { label: string; amount: number };
type PnlSection = { title: string; rows: PnlRow[]; total?: PnlRow };
type PnlReport = {
  title: string;
  fromDate: string;
  toDate: string;
  sections: PnlSection[];
  totals: { income: number; expenses: number; netProfit: number };
};
type XeroState = { configured: boolean; connected: boolean };

type PeriodKey = "month" | "quarter" | "fy" | "lastfy" | "custom";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "fy", label: "This FY" },
  { key: "lastfy", label: "Last FY" },
  { key: "custom", label: "Custom" },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Date range for a period key. FY is Australian (July–June). */
function periodRange(key: Exclude<PeriodKey, "custom">): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "month":
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case "quarter":
      return { from: ymd(new Date(y, Math.floor(m / 3) * 3, 1)), to: ymd(now) };
    case "fy": {
      const start = m >= 6 ? y : y - 1;
      return { from: ymd(new Date(start, 6, 1)), to: ymd(now) };
    }
    case "lastfy": {
      const start = (m >= 6 ? y : y - 1) - 1;
      return { from: ymd(new Date(start, 6, 1)), to: ymd(new Date(start + 1, 5, 30)) };
    }
  }
}

export default function PnlPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [custom, setCustom] = useState(() => periodRange("month"));
  const [report, setReport] = useState<PnlReport | null>(null);
  const [xero, setXero] = useState<XeroState>({ configured: false, connected: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = period === "custom" ? custom : periodRange(period);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ report: PnlReport | null; xero: XeroState }>(
        `/api/xero/pnl?from=${from}&to=${to}`
      );
      setReport(data.report);
      setXero(data.xero);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period === "custom") return; // custom loads on Apply
    const r = periodRange(period);
    load(r.from, r.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <div className="px-4 pt-6">
      <header className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Money</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">Profit &amp; loss straight from your Xero books.</p>
      </header>

      <div className="mt-4">
        <MoneyTabs />
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              period === p.key ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 dark:bg-night-850 dark:text-slate-300 dark:ring-night-line"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="card mb-4 flex items-end gap-2 p-3">
          <label className="flex-1 text-xs text-stone-500 dark:text-slate-400">
            From
            <input
              type="date"
              className="input mt-1 w-full"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label className="flex-1 text-xs text-stone-500 dark:text-slate-400">
            To
            <input
              type="date"
              className="input mt-1 w-full"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </label>
          <button
            onClick={() => load(custom.from, custom.to)}
            disabled={!custom.from || !custom.to}
            className="btn-primary"
          >
            Apply
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : !xero.connected ? (
        <EmptyState
          icon={<span className="text-2xl">📊</span>}
          title="Connect Xero to see your P&L"
          subtitle={
            xero.configured
              ? "Your real income and expenses, straight from your books."
              : "Add your Xero app keys to the server first, then connect in Settings."
          }
          action={
            <Link href="/settings" className="btn-primary">
              Go to Settings
            </Link>
          }
        />
      ) : error ? (
        <EmptyState icon={<span className="text-2xl">⚠️</span>} title="Couldn't load the report" subtitle={error} />
      ) : !report ? (
        <EmptyState icon={<span className="text-2xl">📊</span>} title="No report for this period" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <HeadlineStat label="Income" value={report.totals.income} tone="sky" />
            <HeadlineStat label="Expenses" value={report.totals.expenses} tone="amber" />
            <HeadlineStat
              label={report.totals.netProfit < 0 ? "Net loss" : "Net profit"}
              value={report.totals.netProfit}
              tone={report.totals.netProfit < 0 ? "red" : "green"}
            />
          </div>

          <p className="mb-3 text-xs text-stone-400 dark:text-slate-500">
            {range.from} → {range.to}
          </p>

          <div className="space-y-3 pb-4 stagger">
            {report.sections.map((section, i) => (
              <div key={i} className="card p-4">
                {section.title && (
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-1.5 text-sm">
                  {section.rows.map((row, j) => (
                    <div key={j} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 text-stone-600 dark:text-slate-300">{row.label}</span>
                      <span className="whitespace-nowrap text-stone-800 dark:text-slate-100">{fmtMoney(row.amount)}</span>
                    </div>
                  ))}
                  {section.total && (
                    <div className="flex items-baseline justify-between gap-3 border-t border-stone-100 pt-1.5 dark:border-night-line">
                      <span className="min-w-0 flex-1 font-semibold text-stone-800 dark:text-slate-100">{section.total.label}</span>
                      <span className="whitespace-nowrap font-bold text-stone-900 dark:text-slate-100">
                        {fmtMoney(section.total.amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HeadlineStat({ label, value, tone }: { label: string; value: number; tone: "sky" | "amber" | "green" | "red" }) {
  const tones = {
    sky: "text-sky-700 dark:text-sky-300",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-green-700 dark:text-green-300",
    red: "text-red-700 dark:text-red-300",
  };
  return (
    <div className="card px-2 py-3 text-center">
      <div className={`truncate text-base font-bold ${tones[tone]}`}>{fmtMoney(value)}</div>
      <div className="text-xs text-stone-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

type Inv = {
  id: string; number: string; kind: string; status: string; currency: string;
  total: number; amountPaid: number; amountDue: number; issueDate: string; dueDate: string | null; payUrl: string | null;
};

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(n);
}
function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
}
const STATUS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  authorised: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  submitted: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  voided: "bg-stone-100 text-stone-500 dark:bg-night-800 dark:text-slate-400",
};

// Client money view (P11.2): the client's invoices with live status (mirrored
// from Xero after the office syncs) and a pay link when one's outstanding.
export function PortalInvoices() {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ invoices: Inv[] }>("/api/portal/invoices").then((d) => setInvoices(d.invoices)).catch(() => {}).finally(() => setReady(true));
  }, []);

  if (!ready || invoices.length === 0) return null;
  const outstanding = invoices.reduce((s, i) => s + (i.status === "paid" ? 0 : i.amountDue), 0);

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-night-line">
        <p className="font-semibold text-stone-900 dark:text-slate-100">Your invoices</p>
        {outstanding > 0 && <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{money(outstanding, invoices[0].currency)} due</p>}
      </div>
      <ul className="divide-y divide-stone-100 dark:divide-night-line">
        {invoices.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-slate-100">
                {inv.kind}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[inv.status] || "bg-stone-100 text-stone-500 dark:bg-night-800 dark:text-slate-400"}`}>{inv.status}</span>
              </p>
              <p className="text-xs text-stone-400 dark:text-slate-500">{inv.number}{inv.dueDate && inv.status !== "paid" ? ` · due ${fmt(inv.dueDate)}` : ""}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-stone-900 dark:text-slate-100">{money(inv.total, inv.currency)}</p>
              {inv.status === "paid" ? (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Paid ✓</p>
              ) : inv.payUrl ? (
                <a href={inv.payUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600">Pay / view →</a>
              ) : inv.amountDue > 0 ? (
                <p className="text-xs text-stone-400 dark:text-slate-500">{money(inv.amountDue, inv.currency)} due</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

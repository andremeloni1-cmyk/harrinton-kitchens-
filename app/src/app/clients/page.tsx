"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import { InvoiceStatusPill } from "@/components/InvoiceStatusPill";
import { fmtMoney, fmtDay } from "@/lib/format";
import { api } from "@/lib/job";
import { companyPalette } from "@/lib/colors";

type ClientJob = {
  id: string;
  reference: string;
  title: string;
  status: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  quoteAmount?: number | null;
  currency: string;
  siteContact?: string | null;
  address?: string | null;
};
type ClientInvoice = {
  id: string;
  number: string;
  status: string;
  total: number;
  amountDue: number;
  dueDate?: string | null;
  currency: string;
  overdue: boolean;
};
type Pipeline = {
  leads: number;
  leadsValue: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
};
type Client = {
  key: string;
  clientId?: string | null;
  companyId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  leadSource?: string | null;
  jobCount: number;
  activeCount: number;
  totalValue: number;
  currency: string;
  lastActivityAt: string;
  jobs: ClientJob[];
  invoiced: number;
  paid: number;
  outstanding: number;
  overdueCount: number;
  xeroLinked: boolean;
  invoices: ClientInvoice[];
  pipeline: Pipeline;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { clients } = await api<{ clients: Client[] }>("/api/clients");
        setClients(clients);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        c.jobs.some(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            (j.siteContact || "").toLowerCase().includes(q) ||
            (j.address || "").toLowerCase().includes(q)
        )
    );
  }, [clients, query]);

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Clients</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">The builders and companies you install for</p>
      </header>

      <div className="relative mb-3">
        <input
          className="input rounded-full pl-10"
          placeholder="Search company or site contact…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <svg className="absolute left-3 top-3 h-5 w-5 text-stone-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 skeleton rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">👤</span>}
          title={clients.length === 0 ? "No clients yet" : "No matches"}
          subtitle={clients.length === 0 ? "Clients appear here automatically as jobs come in." : "No clients match your search."}
        />
      ) : (
        <div className="space-y-2.5 stagger">
          {filtered.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelected(c)}
              className={`card tap flex w-full items-center gap-3 border-l-4 p-3.5 text-left transition active:scale-[0.99] ${
                companyPalette({ companyId: c.companyId, companyName: c.name, leadSource: c.leadSource, clientEmail: c.email }).bar
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-500 dark:bg-night-800 dark:text-slate-400">
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-stone-900 dark:text-slate-100">
                  <span className="truncate">{c.name}</span>
                  {c.xeroLinked && <XeroDot />}
                </p>
                <p className="truncate text-xs text-stone-500 dark:text-slate-400">{c.email || c.phone || c.address || "—"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">
                  {fmtMoney(c.invoiced > 0 ? c.invoiced : c.totalValue, c.currency)}
                </p>
                {c.overdueCount > 0 ? (
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {c.overdueCount} overdue · {fmtMoney(c.outstanding, c.currency)}
                  </p>
                ) : c.outstanding > 0 ? (
                  <p className="text-xs text-sky-700 dark:text-sky-400">{fmtMoney(c.outstanding, c.currency)} owed</p>
                ) : (
                  <p className="text-xs text-stone-400 dark:text-slate-500">
                    {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                    {c.activeCount > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {c.activeCount} active</span>}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || "Client"}>
        {selected && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                  ✉️ {selected.email}
                </a>
              )}
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                  📞 {selected.phone}
                </a>
              )}
            </div>
            {selected.address && <p className="text-sm text-stone-500 dark:text-slate-400">📍 {selected.address}</p>}
            {selected.xeroLinked && (
              <p className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500">
                <XeroDot /> Linked to a Xero contact
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Jobs" value={String(selected.jobCount)} />
              <Stat label="Active" value={String(selected.activeCount)} />
              <Stat label="Value" value={fmtMoney(selected.totalValue, selected.currency)} />
              <Stat label="Invoiced" value={fmtMoney(selected.invoiced, selected.currency)} />
              <Stat label="Paid" value={fmtMoney(selected.paid, selected.currency)} />
              <Stat
                label="Outstanding"
                value={fmtMoney(selected.outstanding, selected.currency)}
                tone={selected.overdueCount > 0 ? "red" : undefined}
              />
            </div>

            {/* Pipeline: open leads vs won vs lost, with quote values. */}
            <div className="flex flex-wrap gap-2 text-xs">
              <PipelineChip label="Leads" count={selected.pipeline.leads} value={selected.pipeline.leadsValue} currency={selected.currency} cls="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" />
              <PipelineChip label="Won" count={selected.pipeline.won} value={selected.pipeline.wonValue} currency={selected.currency} cls="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" />
              <PipelineChip label="Lost" count={selected.pipeline.lost} value={selected.pipeline.lostValue} currency={selected.currency} cls="bg-stone-100 text-stone-500 dark:bg-night-800 dark:text-slate-400" />
            </div>

            {selected.invoices.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Invoices</p>
                <div className="card divide-y divide-stone-100 dark:divide-night-line">
                  {selected.invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href="/invoices"
                      className="flex items-center gap-3 px-3.5 py-2.5 active:bg-stone-50 dark:active:bg-night-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{inv.number}</p>
                        <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                          {inv.dueDate ? `Due ${fmtDay(inv.dueDate)}` : "No due date"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-stone-600 dark:text-slate-300">
                        {fmtMoney(inv.total, inv.currency)}
                      </span>
                      <InvoiceStatusPill status={inv.status} overdue={inv.overdue} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Jobs</p>
              <div className="card divide-y divide-stone-100 dark:divide-night-line">
                {selected.jobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="flex items-center gap-3 px-3.5 py-2.5 active:bg-stone-50 dark:active:bg-night-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{j.title}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                        {j.reference} · {fmtDay(j.scheduledStart)}
                      </p>
                      {(j.siteContact || j.address) && (
                        <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                          📍 {[j.siteContact, j.address].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {j.quoteAmount != null && (
                      <span className="shrink-0 text-xs font-medium text-stone-600 dark:text-slate-300">{fmtMoney(j.quoteAmount, j.currency)}</span>
                    )}
                    <StatusPill status={j.status} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2 dark:bg-night-850">
      <div className={`truncate text-sm font-bold ${tone === "red" ? "text-red-700 dark:text-red-300" : "text-stone-900 dark:text-slate-100"}`}>{value}</div>
      <div className="text-[11px] text-stone-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function PipelineChip({
  label,
  count,
  value,
  currency,
  cls,
}: {
  label: string;
  count: number;
  value: number;
  currency: string;
  cls: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${cls}`}>
      {label} {count}
      {value > 0 && <span className="opacity-70">· {fmtMoney(value, currency)}</span>}
    </span>
  );
}

/** Tiny Xero-link marker (the brand is a blue circle). */
function XeroDot() {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" title="Linked to Xero" />;
}

function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/job";
import { relativeTime } from "@/lib/format";
import {
  LOAD_STATUS_LABELS,
  loadProgress,
  reconciliationSummary,
  type LoadItemLike,
  type LoadStatus,
} from "@/lib/loads";

type LoadRow = {
  id: string;
  reference: string;
  status: LoadStatus;
  driverName: string | null;
  vehicle: string;
  note: string;
  departedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  stops: { id: string; address: string; sequence: number; job: { id: string; reference: string; title: string } }[];
  items: LoadItemLike[];
};

const STATUS_STYLES: Record<LoadStatus, string> = {
  open: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  departed: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
  delivered:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  cancelled: "bg-stone-100 text-stone-500 ring-stone-200 dark:bg-night-800 dark:text-slate-400 dark:ring-night-line",
};

export function DeliveryList({ canManage }: { canManage: boolean }) {
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ loads: LoadRow[] }>("/api/loads");
      setLoads(r.loads);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startLoad() {
    setBusy(true);
    try {
      const r = await api<{ load: LoadRow }>("/api/loads", { method: "POST", body: JSON.stringify({}) });
      window.location.href = `/deliveries/${r.load.id}`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Deliveries</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            Load the truck against the list, then prove it arrived.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary shrink-0" disabled={busy} onClick={startLoad}>
            {busy ? "Starting…" : "New load"}
          </button>
        )}
      </header>

      {loading ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">Loading…</p>
      ) : loads.length === 0 ? (
        <EmptyState
          title="No loads yet"
          subtitle={
            canManage
              ? "Start a load, add the jobs going on the truck, and the cut list becomes the loading list."
              : "Nothing to load right now."
          }
        />
      ) : (
        <div className="space-y-3">
          {loads.map((row) => {
            const progress = loadProgress(row.items);
            const discrepancies = reconciliationSummary(row.items);
            return (
              <Link key={row.id} href={`/deliveries/${row.id}`} className="card block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-stone-900 dark:text-slate-100">
                      {row.reference}
                      {row.vehicle && (
                        <span className="font-normal text-stone-400 dark:text-slate-500"> · {row.vehicle}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                      {row.stops.length === 0
                        ? "No stops yet"
                        : row.stops
                            .slice(0, 2)
                            .map((s) => s.job.title)
                            .join(", ") + (row.stops.length > 2 ? ` +${row.stops.length - 2}` : "")}
                    </p>
                    {row.driverName && (
                      <p className="truncate text-xs text-stone-400 dark:text-slate-500">🚚 {row.driverName}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[row.status]}`}
                  >
                    {LOAD_STATUS_LABELS[row.status]}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-2.5 dark:border-night-line">
                  <span className="text-xs font-medium text-stone-500 dark:text-slate-400">
                    {progress.done} of {progress.total} loaded
                  </span>
                  {discrepancies ? (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{discrepancies}</span>
                  ) : (
                    <span className="text-xs text-stone-400 dark:text-slate-500">
                      {relativeTime(row.deliveredAt || row.departedAt || row.createdAt)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

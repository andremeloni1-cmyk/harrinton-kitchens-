"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";

// Part-level production progress for the office (P8.2). Shows each station's %
// derived from where parts have been scanned, plus the not-yet-scanned parts.
// Renders nothing until a cut list exists, so it stays out of the way pre-factory.

type StationProg = { stationId: string; name: string; done: number; total: number; pct: number };
type PartRow = { id: string; name: string; cabinet: string | null; lastStation: string | null; scannedAt: string | null };
type Data = {
  stations: { id: string; name: string; position: number }[];
  progress: StationProg[];
  parts: PartRow[];
};

export function PartsProgress({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/factory/jobs/${jobId}/parts`)); }
    catch { setFailed(true); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  if (failed || !data || data.parts.length === 0) return null;

  const unscanned = data.parts.filter((p) => !p.lastStation);
  const scannedCount = data.parts.length - unscanned.length;

  return (
    <div className="card mb-3 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Production progress</h2>
        <button className="text-sm font-medium text-brand-600" onClick={load}>Refresh</button>
      </div>
      <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">{scannedCount}/{data.parts.length} parts scanned through the line</p>

      <div className="space-y-2">
        {data.progress.map((s) => (
          <div key={s.stationId}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="text-stone-700 dark:text-slate-200">{s.name}</span>
              <span className="text-stone-400 dark:text-slate-500">{s.done}/{s.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-night-800">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {unscanned.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-slate-200">Not scanned yet ({unscanned.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {unscanned.slice(0, 40).map((p) => (
              <span key={p.id} className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600 dark:bg-night-800 dark:text-slate-300">
                {p.cabinet ? `${p.cabinet} · ` : ""}{p.name}
              </span>
            ))}
            {unscanned.length > 40 && <span className="px-2 py-1 text-xs text-stone-400">+{unscanned.length - 40} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

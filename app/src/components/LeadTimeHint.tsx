"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

type LeadTime = { cabinetCount: number; startFrom: string; finish: string; install: string; totalHours: number };

function fmt(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// Sales-facing live lead time (P9.3): the earliest realistic install date for a
// job of ~N cabinets given the shop's current load. The number is deterministic
// (capacity engine) — this just shows it and lets sales tweak the size.
export function LeadTimeHint({ initialCabinets = 10 }: { initialCabinets?: number }) {
  const [cabinets, setCabinets] = useState(initialCabinets);
  const [data, setData] = useState<LeadTime | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<LeadTime>(`/api/factory/lead-time?cabinets=${cabinets}`)
        .then((d) => { if (live) { setData(d); setFailed(false); } })
        .catch(() => { if (live) setFailed(true); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [cabinets]);

  if (failed) return null;

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">Earliest install</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">at the shop&apos;s current load</p>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-stone-500 dark:text-slate-400">
          <input
            type="number"
            min={1}
            max={60}
            className="input w-16 text-right"
            value={cabinets}
            onChange={(e) => setCabinets(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          />
          <span>cabinets</span>
        </label>
      </div>
      <p className="mt-2 text-lg font-bold text-brand-700 dark:text-brand-300">
        {data ? fmt(data.install) : "…"}
      </p>
      {data && (
        <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">
          ~{data.totalHours}h of shop time · production done ~{fmt(data.finish)}
        </p>
      )}
    </div>
  );
}

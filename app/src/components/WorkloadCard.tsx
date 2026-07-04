"use client";

import { useMemo } from "react";
import type { JobDTO } from "@/lib/job";
import { workdaySegments, startOfWeek, WORKDAY_MINS } from "@/lib/schedule";

const WEEKS = 6;
const WEEK_CAPACITY = 5 * WORKDAY_MINS; // Mon–Fri work days

/** Upcoming weekly load: booked installer-minutes vs. a 5-day work week. */
export function WorkloadCard({ jobs }: { jobs: JobDTO[] }) {
  const weeks = useMemo(() => {
    const first = startOfWeek(new Date());
    const buckets = Array.from({ length: WEEKS }, (_, i) => ({
      start: new Date(first.getTime() + i * 7 * 86400000),
      minutes: 0,
      jobs: new Set<string>(),
    }));
    const lastEnd = buckets[WEEKS - 1].start.getTime() + 7 * 86400000;

    for (const j of jobs) {
      if (!j.scheduledStart || j.status === "cancelled") continue;
      for (const seg of workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS)) {
        const t = seg.start.getTime();
        if (t < first.getTime() || t >= lastEnd) continue;
        const idx = Math.floor((t - first.getTime()) / (7 * 86400000));
        if (idx < 0 || idx >= WEEKS) continue;
        buckets[idx].minutes += (seg.end.getTime() - seg.start.getTime()) / 60000;
        buckets[idx].jobs.add(j.id);
      }
    }
    return buckets.map((b) => ({
      start: b.start,
      pct: Math.min(100, Math.round((b.minutes / WEEK_CAPACITY) * 100)),
      jobCount: b.jobs.size,
    }));
  }, [jobs]);

  return (
    <details className="card mb-3 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-stone-700 dark:text-slate-200">
        Workload — next {WEEKS} weeks
      </summary>
      <ul className="mt-2 space-y-2">
        {weeks.map((w) => (
          <li key={w.start.toISOString()} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-stone-500 dark:text-slate-400">
              {w.start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-night-800">
              <div className={`grow-x h-full rounded-full ${workloadBarColor(w.pct)}`} style={{ width: `${w.pct}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-stone-400 dark:text-slate-500">
              {w.pct}% · {w.jobCount} job{w.jobCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-stone-400 dark:text-slate-500">Based on a 5-day work week ({WORKDAY_MINS} min/day).</p>
    </details>
  );
}

export function workloadBarColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  if (pct >= 40) return "bg-emerald-500";
  return "bg-brand-400";
}

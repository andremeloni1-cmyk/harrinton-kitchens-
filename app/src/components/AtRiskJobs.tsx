"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";

type RiskJob = { id: string; reference: string; title: string; dueDate: string | null; reason: string | null };

// Dashboard card: production jobs whose schedule is at risk (P9.2). Renders
// nothing when all's well, so it stays quiet on a healthy board.
export function AtRiskJobs() {
  const [jobs, setJobs] = useState<RiskJob[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ jobs: RiskJob[] }>("/api/factory/at-risk")
      .then((d) => setJobs(d.jobs))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready || jobs.length === 0) return null;

  return (
    <Link href="/factory/schedule" className="mb-4 block">
      <div className="card tap border-l-4 border-red-400 p-3.5 dark:border-red-500/50">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">⚠ {jobs.length} job{jobs.length === 1 ? "" : "s"} at schedule risk</p>
          <span className="text-xs font-medium text-stone-400 dark:text-slate-500">Schedule →</span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {jobs.slice(0, 3).map((j) => (
            <p key={j.id} className="truncate text-xs text-stone-500 dark:text-slate-400">
              <span className="font-medium text-stone-700 dark:text-slate-200">{j.title}</span> — {j.reason}
            </p>
          ))}
          {jobs.length > 3 && <p className="text-xs text-stone-400 dark:text-slate-500">+{jobs.length - 3} more</p>}
        </div>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/job";
import { STAGE_META } from "@/lib/pipeline";
import {
  designSteps,
  designProgress,
  nextAction,
  blockingStep,
  type DesignJob,
  type DesignStepKey,
} from "@/lib/design-queue";

type Filter = "all" | DesignStepKey;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "measure", label: "To measure" },
  { key: "mudmap", label: "Mudmap" },
  { key: "plan", label: "To draw" },
  { key: "drawing", label: "To send" },
  { key: "approval", label: "With client" },
];

/**
 * The designer's worklist. Every job in pre-production, ordered by how little
 * has been done, each showing the five steps and the one thing it is waiting
 * on — the question is "what's stopping this", not "what stage is it at".
 */
export function DesignQueue({ embedded = false }: { embedded?: boolean } = {}) {
  const [jobs, setJobs] = useState<DesignJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api<{ jobs: DesignJob[] }>("/api/design")
      .then((r) => setJobs(r.jobs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const job of jobs) {
      const blocking = blockingStep(job);
      if (blocking) out[blocking.key] = (out[blocking.key] || 0) + 1;
    }
    return out;
  }, [jobs]);

  const filtered = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => blockingStep(j)?.key === filter)),
    [jobs, filter]
  );

  return (
    // Embedded inside DesignTabs, the page furniture (padding and heading)
    // already exists — repeating it would indent the queue inside the tabs.
    <div className={embedded ? "" : "px-4 pt-6"}>
      {!embedded && (
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Design</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            Check measure, mudmap, plan, then the client&apos;s sign-off.
          </p>
        </header>
      )}

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? jobs.length : counts[f.key] || 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                filter === f.key
                  ? "bg-brand-600 text-white"
                  : "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${filter === f.key ? "text-white/70" : "text-stone-400 dark:text-slate-500"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "Nothing in design" : "Nothing waiting on that"}
          subtitle={
            filter === "all"
              ? "Jobs appear here once they reach check measure, design or approval."
              : "Try another filter."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: DesignJob }) {
  const steps = designSteps(job);
  const progress = designProgress(job);
  const action = nextAction(job);

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${job.id}`} className="block">
            <p className="truncate text-sm font-bold text-stone-900 dark:text-slate-100">{job.title}</p>
            <p className="truncate text-xs text-stone-500 dark:text-slate-400">
              {job.reference}
              {job.clientName ? ` · ${job.clientName}` : ""}
            </p>
            {job.address && (
              <p className="truncate text-xs text-stone-400 dark:text-slate-500">📍 {job.address}</p>
            )}
          </Link>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300">
          {STAGE_META[job.stage]?.label || job.stage}
        </span>
      </div>

      <ol className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.key} className="flex items-baseline gap-2 text-xs">
            <span
              className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                step.state === "done" ? "bg-emerald-500" : "bg-stone-300 dark:bg-night-line"
              }`}
            />
            <span
              className={`w-24 shrink-0 font-semibold ${
                step.state === "done"
                  ? "text-stone-400 line-through dark:text-slate-600"
                  : "text-stone-700 dark:text-slate-200"
              }`}
            >
              {step.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-stone-500 dark:text-slate-400">{step.detail}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3 dark:border-night-line">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
          {progress.done} of {progress.total} done
        </span>
        <Link href={action.href} className="btn-primary shrink-0 text-sm">
          {action.label}
        </Link>
      </div>
    </div>
  );
}

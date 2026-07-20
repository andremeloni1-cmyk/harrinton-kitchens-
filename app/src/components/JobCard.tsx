"use client";

import Link from "next/link";
import { StatusPill } from "./StatusPill";
import { fmtMoney, fmtDay, fmtRange } from "@/lib/format";
import type { JobDTO } from "@/lib/job";

/** A confirmed/scheduled job that still has no PDF plan on file. */
function awaitingPlans(job: JobDTO): boolean {
  if (!["accepted", "scheduled", "in_progress"].includes(job.status)) return false;
  const docs = job.documents || [];
  return !docs.some((d) => /\.pdf$/i.test(d.name));
}

export function JobCard({ job }: { job: JobDTO }) {
  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="card tap p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {job.priority === "high" && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="High priority" />
              )}
              <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</h3>
            </div>
            <p className="mt-0.5 truncate text-sm text-stone-500 dark:text-slate-400">
              {job.companyName || job.clientName || "No client"} · {job.reference}
              {job.companyName && job.clientName ? ` · ${job.clientName}` : ""}
            </p>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <CalIcon /> {fmtDay(job.scheduledStart)}
            {job.scheduledStart && <span className="text-stone-400 dark:text-slate-500">· {fmtRange(job.scheduledStart, job.scheduledEnd)}</span>}
          </span>
          {job.quoteAmount != null && (
            <span className="inline-flex items-center gap-1.5 font-medium text-stone-700 dark:text-slate-200">
              {fmtMoney(job.quoteAmount, job.currency)}
            </span>
          )}
          {job.installer && (
            <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: job.installer.color || "#0d9488" }} />
              {job.installer.name}
            </span>
          )}
        </div>

        {(job.address || (job.documents && job.documents.length > 0) || awaitingPlans(job)) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-400 dark:text-slate-500">
            {job.address && <span className="inline-flex items-center gap-1 truncate"><PinIcon /> {job.address}</span>}
            {job.documents && job.documents.length > 0 && (
              <span className="inline-flex items-center gap-1">📎 {job.documents.length}</span>
            )}
            {awaitingPlans(job) && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Awaiting plans</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function CalIcon() {
  return (
    <svg className="h-4 w-4 text-stone-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

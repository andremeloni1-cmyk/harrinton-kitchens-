"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { fmtRange } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { workdaySegments, WORKDAY_MINS } from "@/lib/schedule";
import { useMounted } from "@/lib/use-mounted";

type RunJob = JobDTO & { _segStart: string; _segEnd: string; _dayIndex: number; _dayCount: number };

type TodayVisit = {
  id: string;
  type: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  notes: string | null;
  job: { id: string; title: string; reference: string; address: string | null; clientName: string | null; clientPhone: string | null };
};

const ON_SITE = ["accepted", "scheduled", "in_progress"];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function TodayPage() {
  const [jobs, setJobs] = useState<RunJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visits, setVisits] = useState<TodayVisit[]>([]);
  // Compute "today" only after mount. Rendering new Date() during SSR uses the
  // server's (UTC) clock, which mismatches the client's local date on hydration.
  const mounted = useMounted();
  const today = mounted ? new Date() : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { jobs } = await api<{ jobs: JobDTO[] }>("/api/jobs?scheduled=1");
      const t = new Date();
      const out: RunJob[] = [];
      for (const j of jobs) {
        if (!j.scheduledStart || !ON_SITE.includes(j.status)) continue;
        const segs = workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS);
        const idx = segs.findIndex((s) => sameDay(s.start, t));
        if (idx >= 0) {
          out.push({
            ...j,
            _segStart: segs[idx].start.toISOString(),
            _segEnd: segs[idx].end.toISOString(),
            _dayIndex: idx,
            _dayCount: segs.length,
          });
        }
      }
      out.sort((a, b) => new Date(a._segStart).getTime() - new Date(b._segStart).getTime());
      setJobs(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api<{ visits: TodayVisit[] }>("/api/visits/today").then((r) => setVisits(r.visits)).catch(() => {});
  }, [load]);

  async function setStatus(job: RunJob, status: string) {
    setBusyId(job.id);
    try {
      await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Today</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">
          {today ? today.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) : " "} ·{" "}
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
        </p>
      </header>

      {/* Your site visits today (consults / check measures assigned to you) */}
      {visits.length > 0 && (
        <section className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your site visits</p>
          <div className="space-y-2">
            {visits.map((v) => (
              <Link key={v.id} href={`/jobs/${v.job.id}`} className="card block p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-brand-600">{fmtRange(v.scheduledStart, v.scheduledEnd ?? v.scheduledStart)}</p>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {v.type === "CHECK_MEASURE" ? "Check measure" : "Consultation"}
                  </span>
                </div>
                <h3 className="mt-0.5 truncate font-semibold text-stone-900 dark:text-slate-100">{v.job.title}</h3>
                <p className="truncate text-sm text-stone-500 dark:text-slate-400">
                  {v.job.clientName || "—"}{v.job.address ? ` · ${v.job.address}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : jobs.length === 0 && visits.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="text-3xl">🎉</span>
          <p className="font-semibold text-stone-800 dark:text-slate-100">Nothing on today</p>
          <p className="text-sm text-stone-500 dark:text-slate-400">Confirmed jobs scheduled for today show up here.</p>
          <Link href="/calendar" className="btn-secondary mt-2">Open calendar</Link>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {jobs.map((job) => (
            <div key={job.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-brand-600">{fmtRange(job._segStart, job._segEnd)}</p>
                  <Link href={`/jobs/${job.id}`}>
                    <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">
                      {job.title}
                      {job._dayCount > 1 && (
                        <span className="ml-1.5 text-xs font-normal text-stone-400 dark:text-slate-500">· Day {job._dayIndex + 1}/{job._dayCount}</span>
                      )}
                    </h3>
                  </Link>
                  <p className="truncate text-sm text-stone-500 dark:text-slate-400">{job.clientName || "—"}</p>
                </div>
                <StatusPill status={job.status} />
              </div>

              {job.address && <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">📍 {job.address}</p>}

              {/* Quick contact / nav / docs */}
              <div className="mt-3 flex flex-wrap gap-2">
                {job.clientPhone && (
                  <a href={`tel:${job.clientPhone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                    📞 Call
                  </a>
                )}
                {job.address && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200"
                  >
                    🧭 Navigate
                  </a>
                )}
                {(job.documents || [])
                  .filter((d) => d.webViewLink)
                  .map((d) => (
                    <a key={d.id} href={d.webViewLink || "#"} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                      📎 {d.name}
                    </a>
                  ))}
              </div>

              {/* Run actions */}
              <div className="mt-3 flex gap-2">
                {job.status !== "in_progress" ? (
                  <button className="btn-secondary flex-1 py-2" disabled={busyId === job.id} onClick={() => setStatus(job, "in_progress")}>
                    {busyId === job.id ? "…" : "Start"}
                  </button>
                ) : (
                  <span className="flex-1 rounded-xl bg-amber-50 py-2 text-center text-sm font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">In progress</span>
                )}
                <button className="btn-primary flex-1 py-2" disabled={busyId === job.id} onClick={() => setStatus(job, "completed")}>
                  {busyId === job.id ? "…" : "Complete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

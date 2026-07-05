"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { relativeTime } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";

type ReportState = "sent" | "draft" | "none";

function reportState(job: JobDTO): ReportState {
  const reports = job.reports || [];
  if (reports.some((r) => r.status === "sent")) return "sent";
  if (reports.length > 0) return "draft";
  return "none";
}

/** Checklist completion % across all rooms in the latest report, or null. */
function reportProgress(job: JobDTO): number | null {
  const data = job.reports?.[0]?.data;
  if (!data) return null;
  try {
    const rooms = (JSON.parse(data).rooms || []) as { items?: { done: boolean }[] }[];
    const items = rooms.flatMap((r) => r.items || []);
    if (items.length === 0) return null;
    return Math.round((items.filter((i) => i.done).length / items.length) * 100);
  } catch {
    return null;
  }
}

const TABS: { key: "all" | ReportState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "none", label: "Needs report" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
];

export default function ReportsPage() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | ReportState>("all");

  useEffect(() => {
    (async () => {
      try {
        const { jobs } = await api<{ jobs: JobDTO[] }>("/api/jobs");
        setJobs(jobs.filter((j) => j.status !== "cancelled"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withState = useMemo(
    () => jobs.map((j) => ({ job: j, state: reportState(j) })),
    [jobs]
  );

  const counts = useMemo(() => {
    return {
      none: withState.filter((x) => x.state === "none").length,
      draft: withState.filter((x) => x.state === "draft").length,
      sent: withState.filter((x) => x.state === "sent").length,
    };
  }, [withState]);

  const filtered = useMemo(() => {
    const list = tab === "all" ? withState : withState.filter((x) => x.state === tab);
    // Prioritise completed/in-progress jobs that still need a report.
    return list.sort((a, b) => {
      const order = { none: 0, draft: 1, sent: 2 } as const;
      return order[a.state] - order[b.state];
    });
  }, [withState, tab]);

  return (
    <div className="px-4 pt-6">
      <header className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Job reports</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">Tick off the work per room and email the client a completion report PDF.</p>
      </header>

      <div className="mb-4 mt-4 grid grid-cols-3 gap-3">
        <Stat label="Needs report" value={counts.none} tone="amber" />
        <Stat label="Drafts" value={counts.draft} tone="sky" />
        <Stat label="Sent" value={counts.sent} tone="green" />
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 dark:bg-night-850 dark:text-slate-300 dark:ring-night-line"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<span className="text-2xl">📄</span>} title="Nothing here" subtitle="Reports for your jobs will show up here." />
      ) : (
        <div className="space-y-3 stagger">
          {filtered.map(({ job, state }) => {
            const latest = job.reports?.[0];
            return (
              <Link key={job.id} href={`/jobs/${job.id}?report=1`} className="block">
                <div className="card tap p-4 transition hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</h3>
                      <p className="mt-0.5 truncate text-sm text-stone-500 dark:text-slate-400">
                        {job.clientName || "No client"} · {job.reference}
                      </p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ReportBadge state={state} />
                      {(() => {
                        const pct = reportProgress(job);
                        return pct != null ? (
                          <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300">
                            {pct}% done
                          </span>
                        ) : null;
                      })()}
                      {latest?.installer && (
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 dark:bg-night-800 dark:text-slate-400">
                          🛠️ {latest.installer.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-stone-400 dark:text-slate-500">
                      {state === "sent" && latest?.sentAt
                        ? `Sent ${relativeTime(latest.sentAt)}`
                        : state === "draft" && latest
                        ? `Updated ${relativeTime(latest.updatedAt || latest.createdAt)}`
                        : "Tap to create"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "sky" | "green" }) {
  const tones = {
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    green: "text-green-700 dark:text-green-300",
  };
  return (
    <div className="card px-3 py-3 text-center">
      <div className={`text-lg font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-stone-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function ReportBadge({ state }: { state: ReportState }) {
  const map = {
    none: { label: "No report yet", cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20" },
    draft: { label: "Draft", cls: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20" },
    sent: { label: "Sent to client", cls: "bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20" },
  }[state];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${map.cls}`}>
      {map.label}
    </span>
  );
}

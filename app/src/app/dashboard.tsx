"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { JobCard } from "@/components/JobCard";
import { Modal } from "@/components/Modal";
import { JobForm } from "@/components/JobForm";
import { LeadInbox } from "@/components/LeadInbox";
import { Brand } from "@/components/Brand";
import { BrandMark } from "@/components/BrandMark";
import { JOB_STATUSES, STATUS_LABELS } from "@/lib/types";
import { api, type JobDTO } from "@/lib/job";
import { workdaySegments, jobEnd, startOfWeek, WORKDAY_MINS, WORK_END_HOUR, WORK_END_MIN } from "@/lib/schedule";
import { fmtDay, fmtTime, fmtMoney } from "@/lib/format";
import { workloadBarColor } from "@/components/WorkloadCard";

const FILTERS = ["active", ...JOB_STATUSES] as const;

// Jobs the owner should look at before anything else on the dashboard.
type AttentionKind = "flagged" | "overdue" | "unscheduled" | "unbilled";
type AttentionItem = { job: JobDTO; kind: AttentionKind };

// useSearchParams needs a Suspense boundary. initialJobs comes from the
// server-rendered page; null means the server query failed and the client
// should fetch (and surface errors) itself.
export function Dashboard({ initialJobs }: { initialJobs: JobDTO[] | null }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-3 px-4 pt-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      }
    >
      <DashboardInner initialJobs={initialJobs} />
    </Suspense>
  );
}

function DashboardInner({ initialJobs }: { initialJobs: JobDTO[] | null }) {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<JobDTO[]>(initialJobs ?? []);
  const [loading, setLoading] = useState(initialJobs === null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>(() => {
    const f = searchParams.get("filter");
    return f && (FILTERS as readonly string[]).includes(f) ? f : "active";
  });
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [showNew, setShowNew] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<JobDTO | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const lastLoadAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Money strip: this month's invoiced/paid + outstanding, from insights.
  const [money, setMoney] = useState<{ invoicedThisMonth: number; paidThisMonth: number; outstanding: number } | null>(null);
  useEffect(() => {
    api<{ summary: { invoicedThisMonth: number; paidThisMonth: number; outstanding: number } }>("/api/insights")
      .then((r) => setMoney(r.summary))
      .catch(() => {});
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const { jobs } = await api<{ jobs: JobDTO[] }>("/api/jobs");
      setJobs(jobs);
      setLoadError(false);
      lastLoadAt.current = Date.now();
    } catch {
      // Unauthenticated users get redirected by middleware; anything else
      // (network, server error) shows a retry card instead of a fake empty
      // list. Silent refreshes keep whatever data is already on screen.
      if (!opts?.silent) setLoadError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // With server-rendered data already on screen, just revalidate quietly —
    // the router cache can serve a stale page when navigating back here.
    load({ silent: initialJobs !== null });
  }, [load, initialJobs]);

  // Revalidate when the app regains focus — this is a PWA that gets reopened
  // on site all day, and the data would otherwise be as old as the last visit.
  useEffect(() => {
    const maybeReload = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadAt.current < 5_000) return;
      load({ silent: true });
    };
    window.addEventListener("focus", maybeReload);
    document.addEventListener("visibilitychange", maybeReload);
    return () => {
      window.removeEventListener("focus", maybeReload);
      document.removeEventListener("visibilitychange", maybeReload);
    };
  }, [load]);

  // Mirror filter/search into the URL so back-navigation from a job page and
  // reloads restore the view. replaceState avoids a server round-trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "active") params.set("filter", filter);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, query]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (filter === "active") {
      list = list.filter((j) => !["completed", "cancelled"].includes(j.status));
    } else {
      list = list.filter((j) => j.status === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.companyName || "").toLowerCase().includes(q) ||
          (j.clientName || "").toLowerCase().includes(q) ||
          j.reference.toLowerCase().includes(q) ||
          (j.leadSource || "").toLowerCase().includes(q) ||
          (j.address || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, filter, query]);

  const counts = useMemo(() => {
    const active = jobs.filter((j) => !["completed", "cancelled"].includes(j.status)).length;
    // Matches the "Scheduled" filter chip so tapping the stat shows exactly
    // this many jobs (previously counted anything with a date, even completed).
    const scheduled = jobs.filter((j) => j.status === "scheduled").length;
    // Pipeline value: quotes for work still on the books. Completed jobs are
    // earnings, not pipeline — they belong in Reports, not this tile.
    const value = jobs
      .filter((j) => !["completed", "cancelled"].includes(j.status))
      .reduce((sum, j) => sum + (j.quoteAmount || 0), 0);
    return { active, scheduled, value };
  }, [jobs]);

  // Per-chip counts for the filter row.
  const chipCounts = useMemo(() => {
    const m: Record<string, number> = { active: counts.active };
    for (const j of jobs) m[j.status] = (m[j.status] || 0) + 1;
    return m;
  }, [jobs, counts.active]);

  // Imported email leads awaiting approval. Collapse duplicates that share the
  // same job name AND client (e.g. a follow-up email about the same job) —
  // keep only the most recently imported one so the inbox shows the up-to-date
  // version. Keying on the client too stops two different clients' jobs that
  // happen to share a name (e.g. "Kitchen install") from swallowing each other.
  const leads = useMemo(() => {
    const pending = jobs.filter((j) => j.leadSource && j.status === "lead");
    const newestByName = new Map<string, JobDTO>();
    for (const j of pending) {
      const key = `${j.title.trim().toLowerCase()}|${(j.clientEmail || "").trim().toLowerCase()}`;
      const existing = newestByName.get(key);
      const ts = (x: JobDTO) => (x.createdAt ? new Date(x.createdAt).getTime() : 0);
      if (!existing || ts(j) > ts(existing)) newestByName.set(key, j);
    }
    return [...newestByName.values()].sort((a, b) =>
      (b.createdAt ? new Date(b.createdAt).getTime() : 0) -
      (a.createdAt ? new Date(a.createdAt).getTime() : 0)
    );
  }, [jobs]);

  // Confirmed jobs on site today, plus the earliest one so the run-sheet
  // shortcut can say when and where the day starts.
  const today = useMemo(() => {
    const t = new Date();
    const same = (a: Date) => a.getFullYear() === t.getFullYear() && a.getMonth() === t.getMonth() && a.getDate() === t.getDate();
    let count = 0;
    let first: { start: Date; job: JobDTO } | null = null;
    for (const j of jobs) {
      if (!j.scheduledStart || !["accepted", "scheduled", "in_progress"].includes(j.status)) continue;
      const seg = workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS).find((s) => same(s.start));
      if (!seg) continue;
      count++;
      if (!first || seg.start < first.start) first = { start: seg.start, job: j };
    }
    return { count, first };
  }, [jobs]);

  // This week's booked capacity and the next completely free weekday — answers
  // "can I take another job?" without opening the calendar.
  const workload = useMemo(() => {
    if (jobs.length === 0) return null;
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const horizon = new Date(weekStart.getTime() + 6 * 7 * 86400000);
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const booked = new Map<string, number>();
    let weekMins = 0;
    for (const j of jobs) {
      if (!j.scheduledStart || j.status === "cancelled") continue;
      for (const seg of workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS)) {
        if (seg.start >= horizon) break;
        const mins = (seg.end.getTime() - seg.start.getTime()) / 60_000;
        booked.set(dayKey(seg.start), (booked.get(dayKey(seg.start)) || 0) + mins);
        if (seg.start >= weekStart && seg.start < weekEnd) weekMins += mins;
      }
    }
    const pct = Math.min(100, Math.round((weekMins / (5 * WORKDAY_MINS)) * 100));
    // First weekday with nothing booked; today only counts before knock-off.
    const afterWork = now.getHours() * 60 + now.getMinutes() >= WORK_END_HOUR * 60 + WORK_END_MIN;
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (afterWork ? 1 : 0));
    let nextFree: Date | null = null;
    while (cursor < horizon) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6 && !booked.get(dayKey(cursor))) {
        nextFree = cursor;
        break;
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return { pct, nextFree };
  }, [jobs]);

  // Jobs the owner should act on: flagged by intake reconciliation, open past
  // their scheduled window, or confirmed but never put on the calendar.
  const attention = useMemo<AttentionItem[]>(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    // A finished job gets a ~2-day grace before it's nagged about — long enough
    // to review/send the draft invoice the app auto-creates on completion.
    const billingGrace = startOfToday.getTime() - 2 * 24 * 60 * 60 * 1000;
    const items: AttentionItem[] = [];
    for (const j of jobs) {
      if (j.flag === "review") {
        items.push({ job: j, kind: "flagged" });
        continue;
      }
      if (j.status === "completed") {
        // Grace measured from the real completion time so ticking a checklist
        // on a done job doesn't restart the clock or hide the nudge.
        const completedAt = j.completedAt ? new Date(j.completedAt).getTime() : null;
        if (j.unbilled && (completedAt === null || completedAt < billingGrace)) {
          items.push({ job: j, kind: "unbilled" });
        }
        continue;
      }
      if (!["accepted", "scheduled", "in_progress"].includes(j.status)) continue;
      if (!j.scheduledStart) {
        items.push({ job: j, kind: "unscheduled" });
        continue;
      }
      const end = j.scheduledEnd
        ? new Date(j.scheduledEnd)
        : jobEnd(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS);
      if (end < startOfToday) items.push({ job: j, kind: "overdue" });
    }
    const order: Record<AttentionKind, number> = { flagged: 0, overdue: 1, unbilled: 2, unscheduled: 3 };
    return items.sort((a, b) => order[a.kind] - order[b.kind]);
  }, [jobs]);

  async function clearFlag(job: JobDTO) {
    // Optimistic: drop the card immediately, restore it if the PATCH fails.
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, flag: null } : j)));
    try {
      await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ flag: null }) });
    } catch {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, flag: "review" } : j)));
      flash("Couldn’t update the job just now.");
    }
  }
  async function cancelJob() {
    const job = confirmCancel;
    if (!job) return;
    setCancelling(true);
    try {
      await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      setConfirmCancel(null);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: "cancelled" } : j)));
      flash(`Job cancelled — ${job.title}`);
      load({ silent: true });
    } catch {
      flash("Couldn’t cancel the job just now.");
    } finally {
      setCancelling(false);
    }
  }

  function flash(m: string) {
    setToast(m);
    // Reset the timer so a second toast in quick succession gets its full
    // display time instead of being dismissed by the first one's timeout.
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function scanInbox() {
    setScanning(true);
    try {
      // force=1: re-check emails even if a previous scan already saw them (so a
      // dismissed lead can be re-imported, and fixes apply to old emails).
      const res = await api<{ created: number; connected: boolean; flagged?: number; plans?: number }>("/api/leads/scan?force=1", { method: "POST" });
      if (!res.connected) flash("Connect Google in Settings to check your inbox.");
      else {
        const parts: string[] = [];
        if (res.created) parts.push(`${res.created} new to confirm`);
        if (res.plans) parts.push(`${res.plans} plans arrived`);
        if (res.flagged) parts.push(`${res.flagged} to review`);
        flash(parts.length ? `Inbox checked — ${parts.join(" · ")}` : "No changes in your inbox");
      }
      await load({ silent: true });
    } catch {
      flash("Couldn't check the inbox just now.");
    } finally {
      setScanning(false);
    }
  }

  async function createJob(payload: Record<string, unknown>) {
    await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
    setShowNew(false);
    await load({ silent: true });
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <Brand variant="header" tagline="Your jobs at a glance" />
        <div className="flex items-center gap-2">
          <Link
            href="/activity"
            aria-label="Activity"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-stone-500 ring-1 ring-stone-200 dark:bg-night-900 dark:text-slate-400 dark:ring-night-line"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-stone-500 ring-1 ring-stone-200 dark:bg-night-900 dark:text-slate-400 dark:ring-night-line"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-in fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-night-800 dark:ring-1 dark:ring-night-line"
        >
          {toast}
        </div>
      )}

      {/* Today's run sheet shortcut */}
      <Link
        href="/today"
        className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-3.5 text-white shadow-sm shadow-brand-600/25 transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Today’s run sheet</p>
          <p className="truncate text-xs text-white/80">
            {today.count > 0 && today.first
              ? `${today.count} job${today.count === 1 ? "" : "s"} on site · first ${fmtTime(today.first.start)} — ${
                  today.first.job.clientName || today.first.job.title
                }`
              : "Nothing scheduled today"}
          </p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm">→</span>
      </Link>

      {/* Money strip — this month's numbers at a glance, tap to full insights */}
      {money && (money.invoicedThisMonth > 0 || money.paidThisMonth > 0 || money.outstanding > 0) && (
        <Link href="/insights" className="mb-4 block">
          <div className="card tap grid grid-cols-3 divide-x divide-stone-100 p-3.5 dark:divide-night-line">
            <div className="px-1 text-center">
              <p className="text-[11px] text-stone-400 dark:text-slate-500">Invoiced (mo)</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-stone-900 dark:text-slate-100">{fmtMoney(money.invoicedThisMonth)}</p>
            </div>
            <div className="px-1 text-center">
              <p className="text-[11px] text-stone-400 dark:text-slate-500">Paid (mo)</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(money.paidThisMonth)}</p>
            </div>
            <div className="px-1 text-center">
              <p className="text-[11px] text-stone-400 dark:text-slate-500">Outstanding</p>
              <p className={`mt-0.5 text-base font-bold tabular-nums ${money.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-stone-900 dark:text-slate-100"}`}>{fmtMoney(money.outstanding)}</p>
            </div>
          </div>
        </Link>
      )}

      {/* Needs attention — flagged, overdue, or confirmed-but-unscheduled */}
      {attention.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
              {attention.length}
            </span>
            Needs attention
          </h2>
          <div className="space-y-2">
            {attention.map(({ job, kind }) =>
              kind === "flagged" ? (
                <div key={job.id} className="card border-l-4 border-amber-400 p-3.5">
                  <Link href={`/jobs/${job.id}`} className="block">
                    <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</h3>
                    <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">⚠️ Not in this week’s email — may be moved or cancelled</p>
                    <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">{job.clientName || job.leadSource}</p>
                  </Link>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-secondary flex-1 py-2" onClick={() => clearFlag(job)}>Keep — it’s fine</button>
                    <button className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300" onClick={() => setConfirmCancel(job)}>Cancel job</button>
                  </div>
                </div>
              ) : kind === "unbilled" ? (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="card block border-l-4 border-emerald-400 p-3.5"
                >
                  <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</h3>
                  <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-300">
                    💰 Completed but not invoiced yet — bill the company for this job
                  </p>
                  <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">
                    {job.companyName || job.clientName || job.reference}
                  </p>
                </Link>
              ) : (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className={`card block border-l-4 p-3.5 ${kind === "overdue" ? "border-red-400" : "border-sky-400"}`}
                >
                  <h3 className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</h3>
                  <p className={`mt-0.5 text-sm ${kind === "overdue" ? "text-red-700 dark:text-red-300" : "text-sky-700 dark:text-sky-300"}`}>
                    {kind === "overdue"
                      ? `Was scheduled for ${fmtDay(job.scheduledStart)} and is still open — mark it done or reschedule`
                      : "Confirmed but not on the calendar yet — pick a date"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">{job.clientName || job.reference}</p>
                </Link>
              )
            )}
          </div>
        </section>
      )}

      {/* Jobs to confirm */}
      {leads.length > 0 && (
        <LeadInbox leads={leads} onChanged={load} onScan={scanInbox} scanning={scanning} />
      )}

      {/* Summary — Active/Scheduled tap through to the matching filter */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat
          label="Active"
          value={String(counts.active)}
          selected={filter === "active"}
          onClick={() => {
            setFilter("active");
            setQuery("");
          }}
        />
        <Stat
          label="Scheduled"
          value={String(counts.scheduled)}
          selected={filter === "scheduled"}
          onClick={() => {
            setFilter("scheduled");
            setQuery("");
          }}
        />
        <Stat
          label="Value"
          value={new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(counts.value)}
        />
      </div>

      {/* Workload at a glance — links to the calendar's full 6-week view */}
      {workload && (
        <Link href="/calendar" className="card mb-4 block px-4 py-3 transition active:scale-[0.99]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">This week {workload.pct}% booked</p>
            <p className="truncate text-xs text-stone-500 dark:text-slate-400">
              {workload.nextFree ? `Next free day ${freeDayLabel(workload.nextFree)}` : "Fully booked for 6 weeks"}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-night-800">
            <div
              className={`h-full rounded-full ${workloadBarColor(workload.pct)}`}
              style={{ width: `${workload.pct}%` }}
            />
          </div>
        </Link>
      )}

      {leads.length === 0 && (
        <button
          onClick={scanInbox}
          disabled={scanning}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200 transition active:scale-[0.99] disabled:opacity-50 dark:bg-night-900 dark:text-slate-300 dark:ring-night-line"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          {scanning ? "Checking inbox…" : "Check inbox for new jobs"}
        </button>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <input
          className="input rounded-full pl-10"
          placeholder="Search jobs, clients, addresses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <svg className="absolute left-3 top-3 h-5 w-5 text-stone-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
      </div>

      {/* New job — full-width button at the top of the list */}
      <button onClick={() => setShowNew(true)} className="btn-accent mb-3 w-full">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        New job
      </button>

      {/* Filter chips — sticky in a frosted pill capsule (iOS-style) so they
          stay reachable while scrolling without floating loose over content */}
      <div className="sticky top-2 z-20 mb-4">
        <div className="glass no-scrollbar flex gap-1.5 overflow-x-auto rounded-full px-2 py-2">
          {FILTERS.map((f) => {
            const n = chipCounts[f] || 0;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === f
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-stone-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-night-800"
                }`}
              >
                {f === "active" ? "Active" : STATUS_LABELS[f as keyof typeof STATUS_LABELS]}
                {n > 0 && <span className={`ml-1.5 text-xs ${filter === f ? "text-white/70" : "text-stone-400 dark:text-slate-500"}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div>
            <p className="font-semibold text-stone-800 dark:text-slate-100">Couldn’t load your jobs</p>
            <p className="text-sm text-stone-500 dark:text-slate-400">Check your connection and try again.</p>
          </div>
          <button className="btn-primary" onClick={() => load()}>
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        jobs.length === 0 ? (
          <EmptyState onAdd={() => setShowNew(true)} />
        ) : (
          <NoMatches
            query={query}
            filter={filter}
            onClearSearch={() => setQuery("")}
            onShowActive={() => setFilter("active")}
            onShowCompleted={() => setFilter("completed")}
          />
        )
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New job">
        <JobForm onSubmit={createJob} onCancel={() => setShowNew(false)} submitLabel="Create job" />
      </Modal>

      <Modal open={!!confirmCancel} onClose={() => setConfirmCancel(null)} title="Cancel this job?">
        {confirmCancel && (
          <div>
            <p className="font-semibold text-stone-900 dark:text-slate-100">{confirmCancel.title}</p>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-slate-400">
              {confirmCancel.clientName || "No client"} · {confirmCancel.reference}
            </p>
            <p className="mt-3 text-sm text-stone-600 dark:text-slate-300">
              This takes the job off your schedule and removes its calendar event.
              {confirmCancel.clientEmail && " The client will be sent a cancellation email."}
            </p>
            <div className="mt-5 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setConfirmCancel(null)} disabled={cancelling}>
                Keep job
              </button>
              <button className="btn-danger flex-1" onClick={cancelJob} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel job"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function freeDayLabel(d: Date): string {
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "today";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(d, tomorrow)) return "tomorrow";
  return fmtDay(d);
}

function Stat({
  label,
  value,
  onClick,
  selected,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const inner = (
    <>
      <div className="text-lg font-bold text-stone-900 dark:text-slate-100">{value}</div>
      <div className="text-xs text-stone-500 dark:text-slate-400">{label}</div>
    </>
  );
  if (!onClick) return <div className="card px-3 py-3 text-center">{inner}</div>;
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl bg-white px-3 py-3 text-center shadow-card transition active:scale-[0.98] dark:bg-night-900 ${
        selected ? "ring-2 ring-brand-400" : "ring-1 ring-stone-100 dark:ring-night-line"
      }`}
    >
      {inner}
    </button>
  );
}

function NoMatches({
  query,
  filter,
  onClearSearch,
  onShowActive,
  onShowCompleted,
}: {
  query: string;
  filter: string;
  onClearSearch: () => void;
  onShowActive: () => void;
  onShowCompleted: () => void;
}) {
  const q = query.trim();
  const label = filter === "active" ? "active" : (STATUS_LABELS[filter as keyof typeof STATUS_LABELS] || filter).toLowerCase();
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div>
        {q ? (
          <>
            <p className="font-semibold text-stone-800 dark:text-slate-100">No matches for “{q}”</p>
            <p className="text-sm text-stone-500 dark:text-slate-400">Try a different name, reference or address.</p>
          </>
        ) : filter === "active" ? (
          <>
            <p className="font-semibold text-stone-800 dark:text-slate-100">No active jobs right now</p>
            <p className="text-sm text-stone-500 dark:text-slate-400">Everything on the books is completed or cancelled.</p>
          </>
        ) : filter === "lead" ? (
          <>
            <p className="font-semibold text-stone-800 dark:text-slate-100">Nothing to confirm</p>
            <p className="text-sm text-stone-500 dark:text-slate-400">New jobs from your inbox will show up here.</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-stone-800 dark:text-slate-100">No {label} jobs</p>
            <p className="text-sm text-stone-500 dark:text-slate-400">Nothing with this status at the moment.</p>
          </>
        )}
      </div>
      {q ? (
        <button className="btn-secondary" onClick={onClearSearch}>
          Clear search
        </button>
      ) : filter === "active" ? (
        <button className="btn-secondary" onClick={onShowCompleted}>
          View completed
        </button>
      ) : (
        <button className="btn-secondary" onClick={onShowActive}>
          Show active jobs
        </button>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
        <BrandMark className="h-6 w-6" />
      </div>
      <div>
        <p className="font-semibold text-stone-800 dark:text-slate-100">No jobs here yet</p>
        <p className="text-sm text-stone-500 dark:text-slate-400">Add your first kitchen job to get started.</p>
      </div>
      <button className="btn-primary" onClick={onAdd}>
        Add a job
      </button>
    </div>
  );
}


"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { RescheduleModal } from "@/components/RescheduleModal";
import { WorkloadCard } from "@/components/WorkloadCard";
import { Modal } from "@/components/Modal";
import { fmtRange, fmtDay } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { workdaySegments, jobEnd, WORKDAY_MINS } from "@/lib/schedule";
import { companyPalette, companyLabel, companyKeyOf } from "@/lib/colors";

// A job rendered on a particular day, carrying that day's working segment.
type DayJob = JobDTO & { _segStart: string; _segEnd: string; _dayIndex: number; _dayCount: number };

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfMonth(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

type ExternalEvent = { id: string; title: string; start: string; end: string; allDay: boolean };

export default function CalendarPage() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [external, setExternal] = useState<ExternalEvent[]>([]);
  const [calStatus, setCalStatus] = useState<{ connected: boolean; error?: string }>({ connected: false });
  const [mode, setMode] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<JobDTO | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [summaryJob, setSummaryJob] = useState<DayJob | null>(null);
  const [summaryEvent, setSummaryEvent] = useState<ExternalEvent | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { jobs } = await api<{ jobs: JobDTO[] }>("/api/jobs?scheduled=1");
      setJobs(jobs.filter((j) => j.status !== "cancelled"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    (async () => {
      // Reflect any jobs moved directly in Google Calendar before showing them.
      try {
        const r = await api<{ updated?: number }>("/api/calendar/sync", { method: "POST" });
        if (r.updated && r.updated > 0) {
          setHint(`Synced ${r.updated} change${r.updated > 1 ? "s" : ""} from Google Calendar`);
          setTimeout(() => setHint(null), 3500);
        }
      } catch {
        /* sync is best-effort */
      }
      await load();
    })();
  }, []);

  // Pull the owner's existing Google Calendar events for the visible range so
  // prior commitments show up while scheduling.
  useEffect(() => {
    const rangeStart =
      mode === "month" ? startOfWeek(startOfMonth(month)) : new Date(weekStart);
    const rangeEnd = new Date(rangeStart.getTime() + (mode === "month" ? 42 : 7) * 86400000);
    let active = true;
    (async () => {
      try {
        const res = await api<{ connected: boolean; error?: string; events: ExternalEvent[] }>(
          `/api/calendar/events?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`
        );
        if (!active) return;
        setExternal(res.events || []);
        setCalStatus({ connected: res.connected, error: res.error });
      } catch {
        if (active) {
          setExternal([]);
          setCalStatus({ connected: false });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, month, weekStart]);

  function jobsForDay(day: Date): DayJob[] {
    const out: DayJob[] = [];
    for (const j of jobs) {
      if (!j.scheduledStart) continue;
      const segs = workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS);
      const idx = segs.findIndex((s) => sameDay(s.start, day));
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
    return out.sort((a, b) => new Date(a._segStart).getTime() - new Date(b._segStart).getTime());
  }

  function externalForDay(day: Date) {
    return external
      .filter((e) => e.start && sameDay(new Date(e.start), day))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  function externalLabel(e: ExternalEvent): string {
    if (e.allDay) return "All day";
    const s = new Date(e.start).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
    return s;
  }

  async function moveJobToDay(job: JobDTO, day: Date) {
    if (!job.scheduledStart) return;
    const old = new Date(job.scheduledStart);
    const next = new Date(day);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (sameDay(old, next)) return;
    const end = jobEnd(next, job.durationMins || WORKDAY_MINS);
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, scheduledStart: next.toISOString(), scheduledEnd: end.toISOString() } : j))
    );
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledStart: next.toISOString(), scheduledEnd: end.toISOString(), notify: true }),
      });
      setHint(`Moved "${job.title}" — client notified`);
      setTimeout(() => setHint(null), 2500);
    } catch {
      load();
    }
  }

  async function dropOnDay(day: Date) {
    if (!dragId) return;
    const job = jobs.find((j) => j.id === dragId);
    setDragId(null);
    if (job) await moveJobToDay(job, day);
  }

  const today = new Date();

  // ----- Month grid (6 weeks x 7 days) -----
  const monthCells = useMemo(() => {
    const first = startOfMonth(month);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86400000));
  }, [month]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
    [weekStart]
  );

  // Distinct companies among scheduled jobs, for the colour-coding legend.
  const companies = useMemo(() => {
    const map = new Map<string, { label: string; swatch: string }>();
    for (const j of jobs) {
      const key = companyKeyOf(j);
      if (!map.has(key)) map.set(key, { label: companyLabel(j), swatch: companyPalette(j).swatch });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [jobs]);

  function shiftMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Calendar</h1>
        {/* Mode toggle */}
        <div className="flex rounded-xl bg-stone-100 p-1 text-sm font-semibold dark:bg-night-800">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1 capitalize transition ${
                mode === m ? "bg-white text-brand-700 shadow-sm dark:bg-night-850 dark:text-brand-300" : "text-stone-500 dark:text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {hint && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{hint}</div>}

      {/* Upcoming workload */}
      {jobs.length > 0 && <WorkloadCard jobs={jobs} />}

      {/* Company colour key */}
      {companies.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {companies.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
              <span className={`h-2.5 w-2.5 rounded-full ${c.swatch}`} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Google Calendar status */}
      {!calStatus.connected ? (
        <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Connect Google in <Link href="/settings" className="font-semibold underline">Settings</Link> to see your existing calendar events here.
        </div>
      ) : calStatus.error ? (
        <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          Couldn’t load your Google Calendar: {calStatus.error}. Make sure the Calendar API is enabled, then try Disconnect &amp; Connect in Settings.
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-xs text-stone-400 dark:text-slate-500">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          {external.length > 0
            ? `${external.length} event${external.length > 1 ? "s" : ""} from your Google Calendar shown in this range`
            : "Connected — no other Google Calendar events in this range"}
        </div>
      )}

      {/* Summary of your Google Calendar events in this range */}
      {calStatus.connected && external.length > 0 && (
        <details className="card mb-3 p-3" open>
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-stone-700 dark:text-slate-200">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Your calendar — {external.length} event{external.length > 1 ? "s" : ""}
            </span>
            <span className="text-xs font-normal text-stone-400 dark:text-slate-500">this {mode}</span>
          </summary>
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {[...external]
              .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
              .map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 text-sm">
                  <span className="w-28 shrink-0 text-xs font-medium text-sky-700 dark:text-sky-300">
                    {new Date(e.start).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="w-12 shrink-0 text-xs text-stone-400 dark:text-slate-500">{externalLabel(e)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-200">{e.title}</span>
                </li>
              ))}
          </ul>
        </details>
      )}

      {mode === "month" ? (
        <>
          {/* Signature dark calendar panel — kept dark in both light & dark themes. */}
          <div className="rounded-bento bg-night-900 p-4 text-white shadow-bento ring-1 ring-inset ring-night-line">
            {/* Month nav */}
            <div className="mb-3 flex items-center justify-between">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-night-800 hover:text-white"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">
                  {month.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                </span>
                <button
                  className="rounded-full bg-night-800 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-night-line hover:text-white"
                  onClick={() => {
                    setMonth(startOfMonth(new Date()));
                    const t = new Date();
                    t.setHours(0, 0, 0, 0);
                    setSelectedDay(t);
                  }}
                >
                  Today
                </button>
              </div>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-night-800 hover:text-white"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            {/* Weekday header */}
            <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-slate-500">
              {WEEKDAY_INITIALS.map((d, i) => (
                <div key={i} className="py-1.5">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {monthCells.map((day) => {
                const inMonth = day.getMonth() === month.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDay);
                const dayJobs = jobsForDay(day);
                const dayBusy = externalForDay(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnDay(day)}
                    className={`flex min-h-[3.4rem] flex-col items-center rounded-xl py-1.5 text-center transition ${
                      dragId ? "ring-1 ring-dashed ring-brand-400/60" : ""
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                        isSelected
                          ? "bg-brand-600 font-bold text-white shadow-sm"
                          : isToday
                            ? "font-bold text-brand-400 ring-1 ring-brand-500"
                            : inMonth
                              ? "text-slate-100"
                              : "text-slate-600"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <span className="mt-1 flex h-2 flex-wrap items-center justify-center gap-0.5">
                      {dayJobs.slice(0, 3).map((j) => (
                        <span
                          key={j.id}
                          className={`h-1.5 w-1.5 rounded-full ${companyPalette(j).dot}`}
                          title={`${j.title} — ${companyLabel(j)}`}
                        />
                      ))}
                      {dayJobs.length > 3 && <span className="text-[9px] leading-none text-slate-400">+{dayJobs.length - 3}</span>}
                      {dayBusy.length > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title={`${dayBusy.length} calendar event(s)`} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day's appointments — rises as a bottom sheet, replays on date change. */}
          <div key={selectedDay.toISOString()} className="sheet-rise card mt-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Appointments</h2>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {selectedDay.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </div>
            <DayList
              jobs={jobsForDay(selectedDay)}
              busy={externalForDay(selectedDay)}
              busyLabel={externalLabel}
              onReschedule={setReschedule}
              onOpen={setSummaryJob}
              onOpenEvent={setSummaryEvent}
              draggable
              setDragId={setDragId}
            />
          </div>
        </>
      ) : (
        <>
          {/* Week nav */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-stone-500 dark:text-slate-400">
              {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} –{" "}
              {days[6].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            <div className="flex items-center gap-1">
              <button className="btn-ghost px-2" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000))} aria-label="Previous week">‹</button>
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
              <button className="btn-ghost px-2" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000))} aria-label="Next week">›</button>
            </div>
          </div>
          <p className="mb-3 hidden text-xs text-stone-400 sm:block dark:text-slate-500">Drag a job to another day to move it.</p>

          <div className="space-y-3">
            {days.map((day) => {
              const dayJobs = jobsForDay(day);
              const dayBusy = externalForDay(day);
              const isToday = sameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOnDay(day)}
                  className={`card overflow-hidden ${dragId ? "ring-2 ring-dashed ring-brand-300" : ""}`}
                >
                  <div className={`flex items-center justify-between px-4 py-2.5 ${isToday ? "bg-brand-50 dark:bg-brand-500/15" : "bg-stone-50 dark:bg-night-850"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isToday ? "text-brand-700 dark:text-brand-300" : "text-stone-700 dark:text-slate-200"}`}>
                        {day.toLocaleDateString("en-AU", { weekday: "long" })}
                      </span>
                      <span className="text-sm text-stone-400 dark:text-slate-500">{day.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                    </div>
                    {isToday && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">Today</span>}
                  </div>
                  {dayJobs.length === 0 && dayBusy.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-stone-300 dark:text-slate-600">No jobs</p>
                  ) : (
                    <ul className="divide-y divide-stone-100 dark:divide-night-line">
                      {dayJobs.map((job) => (
                        <li
                          key={job.id}
                          draggable
                          onDragStart={() => setDragId(job.id)}
                          onDragEnd={() => setDragId(null)}
                          className={`flex items-center gap-3 border-l-4 px-4 py-3 active:bg-stone-50 dark:active:bg-night-800 ${companyPalette(job).bar}`}
                        >
                          <div className="w-14 shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">{fmtRange(job._segStart, job._segEnd)}</div>
                          <button onClick={() => setSummaryJob(job)} className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">
                              {job.title}
                              {job._dayCount > 1 && (
                                <span className="ml-1.5 text-xs font-normal text-stone-400 dark:text-slate-500">· Day {job._dayIndex + 1}/{job._dayCount}</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-stone-500 dark:text-slate-400">{companyLabel(job)}</p>
                          </button>
                          <StatusPill status={job.status} />
                          <button onClick={() => setReschedule(job)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:text-slate-500 dark:hover:bg-night-800" aria-label="Reschedule">
                            <ClockIcon />
                          </button>
                        </li>
                      ))}
                      {dayBusy.map((e) => (
                        <li key={e.id} className="flex items-center gap-3 border-l-4 border-sky-300 px-4 py-2.5">
                          <div className="w-14 shrink-0 text-xs font-medium text-sky-700 dark:text-sky-300">{externalLabel(e)}</div>
                          <button onClick={() => setSummaryEvent(e)} className="min-w-0 flex-1 truncate text-left text-sm text-sky-800 dark:text-sky-300">{e.title}</button>
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">Busy</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <div className="skeleton h-72 rounded-bento" />
          <div className="skeleton h-28 rounded-bento" />
        </div>
      )}

      <RescheduleModal job={reschedule} open={!!reschedule} onClose={() => setReschedule(null)} onDone={load} />

      {/* Tap-to-view summary for a scheduled job (works even once it's on Google). */}
      <Modal open={!!summaryJob} onClose={() => setSummaryJob(null)} title="Job summary">
        {summaryJob && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-slate-100">{summaryJob.title}</h3>
              <StatusPill status={summaryJob.status} />
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${companyPalette(summaryJob).chip}`}>
              <span className={`h-2 w-2 rounded-full ${companyPalette(summaryJob).swatch}`} />
              {companyLabel(summaryJob)}
            </span>
            <dl className="space-y-1.5 text-sm">
              <Row label="When">
                {fmtDay(summaryJob._segStart)} · {fmtRange(summaryJob._segStart, summaryJob._segEnd)}
                {summaryJob._dayCount > 1 && (
                  <span className="text-stone-400 dark:text-slate-500"> · day {summaryJob._dayIndex + 1} of {summaryJob._dayCount}</span>
                )}
              </Row>
              {summaryJob.clientName && <Row label="Client">{summaryJob.clientName}</Row>}
              {summaryJob.address && <Row label="Address">{summaryJob.address}</Row>}
              {summaryJob.reference && <Row label="Ref">{summaryJob.reference}</Row>}
            </dl>
            {summaryJob.description && (
              <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm text-stone-600 dark:bg-night-850 dark:text-slate-300">{summaryJob.description}</p>
            )}
            {summaryJob.documents && summaryJob.documents.length > 0 && (
              <div className="space-y-1">
                {summaryJob.documents
                  .filter((d) => d.webViewLink)
                  .map((d) => (
                    <a key={d.id} href={d.webViewLink || "#"} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-600 underline">
                      📎 {d.name}
                    </a>
                  ))}
              </div>
            )}
            <Link href={`/jobs/${summaryJob.id}`} className="btn-primary w-full">Open full job</Link>
          </div>
        )}
      </Modal>

      {/* Summary for one of the owner's existing Google Calendar events. */}
      <Modal open={!!summaryEvent} onClose={() => setSummaryEvent(null)} title="Calendar event">
        {summaryEvent && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-stone-900 dark:text-slate-100">{summaryEvent.title}</h3>
            <dl className="space-y-1.5 text-sm">
              <Row label="When">
                {fmtDay(summaryEvent.start)}
                {!summaryEvent.allDay && <> · {fmtRange(summaryEvent.start, summaryEvent.end)}</>}
                {summaryEvent.allDay && <span className="text-stone-400 dark:text-slate-500"> · all day</span>}
              </Row>
            </dl>
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">From your Google Calendar</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-stone-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-stone-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function DayList({
  jobs,
  busy = [],
  busyLabel,
  onReschedule,
  onOpen,
  onOpenEvent,
  draggable,
  setDragId,
}: {
  jobs: DayJob[];
  busy?: ExternalEvent[];
  busyLabel?: (e: ExternalEvent) => string;
  onReschedule: (j: JobDTO) => void;
  onOpen: (j: DayJob) => void;
  onOpenEvent: (e: ExternalEvent) => void;
  draggable?: boolean;
  setDragId?: (id: string | null) => void;
}) {
  if (jobs.length === 0 && busy.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No appointments scheduled</div>;
  }
  return (
    <div className="stagger space-y-2">
      {jobs.map((job, i) => (
        <div
          key={job.id}
          draggable={draggable}
          onDragStart={() => setDragId?.(job.id)}
          onDragEnd={() => setDragId?.(null)}
          className={`flex items-center gap-3 rounded-2xl border-l-4 bg-white/50 px-3 py-2.5 transition active:scale-[0.99] dark:bg-night-850/60 ${companyPalette(job).bar}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {i + 1}
          </span>
          <button onClick={() => onOpen(job)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {job.title}
              {job._dayCount > 1 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">· Day {job._dayIndex + 1}/{job._dayCount}</span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {fmtRange(job._segStart, job._segEnd)} · {companyLabel(job)}
            </p>
          </button>
          <StatusPill status={job.status} />
          <button onClick={() => onReschedule(job)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-night-800" aria-label="Reschedule">
            <ClockIcon />
          </button>
        </div>
      ))}
      {busy.map((e, i) => (
        <div key={e.id} className="flex items-center gap-3 rounded-2xl border-l-4 border-sky-300 bg-white/50 px-3 py-2.5 dark:bg-night-850/60">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white">
            {jobs.length + i + 1}
          </span>
          <button onClick={() => onOpenEvent(e)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-sky-800 dark:text-sky-300">{e.title}</p>
            <p className="truncate text-xs text-sky-600/80 dark:text-sky-400/80">{busyLabel ? busyLabel(e) : ""}</p>
          </button>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">Busy</span>
        </div>
      ))}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

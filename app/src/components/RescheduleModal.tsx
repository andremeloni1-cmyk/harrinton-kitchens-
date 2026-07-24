"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { toLocalInput, fmtDay, fmtRange } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { WORKDAY_MINS, WORK_START_HOUR, WORK_START_MIN, jobEnd, workdaySegments, intervalsOverlap } from "@/lib/schedule";

type ExtEvent = { id: string; title: string; start: string; end: string; allDay: boolean };
type Busy = { title: string; segments: { start: Date; end: Date }[] };

const SCHEDULED = ["accepted", "scheduled", "in_progress", "completed"];

export function RescheduleModal({
  job,
  open,
  onClose,
  onDone,
}: {
  job: JobDTO | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState(String(WORKDAY_MINS));
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Busy[]>([]); // other commitments to check clashes against
  const [error, setError] = useState<string | null>(null);

  // Initialise the fields when the modal opens (or the job changes) — NOT on
  // every render. A render-time init snapped a cleared date straight back, so
  // clearing it to unschedule the job was unreachable.
  const jobId = job?.id;
  const jobScheduledStart = job?.scheduledStart ?? null;
  const jobDuration = job?.durationMins ?? null;
  useEffect(() => {
    if (!open) return;
    // Deliberate init-on-open sync (not a render-time derive, which made a
    // cleared date impossible to keep).
    /* eslint-disable react-hooks/set-state-in-effect */
    setStart(jobScheduledStart ? toLocalInput(jobScheduledStart) : "");
    setDuration(String(jobDuration || WORKDAY_MINS));
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, jobId, jobScheduledStart, jobDuration]);

  // Load other scheduled jobs + the owner's Google Calendar events so we can warn
  // about double-bookings. Runs once each time the modal opens.
  useEffect(() => {
    if (!open || !job) return;
    let active = true;
    (async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 35 * 86400000);
      const [jobsRes, calRes] = await Promise.all([
        api<{ jobs: JobDTO[] }>("/api/jobs?scheduled=1").catch(() => ({ jobs: [] as JobDTO[] })),
        api<{ events?: ExtEvent[] }>(`/api/calendar/events?start=${from.toISOString()}&end=${to.toISOString()}`).catch(() => ({ events: [] as ExtEvent[] })),
      ]);
      if (!active) return;
      const list: Busy[] = [];
      for (const j of jobsRes.jobs) {
        if (j.id === job.id || !j.scheduledStart || !SCHEDULED.includes(j.status)) continue;
        list.push({ title: j.title, segments: workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS) });
      }
      for (const e of calRes.events || []) {
        if (!e.start) continue;
        const s = new Date(e.start);
        const en = e.end ? new Date(e.end) : new Date(s.getTime() + 60 * 60000);
        list.push({ title: e.title || "Busy", segments: [{ start: s, end: en }] });
      }
      setBusy(list);
    })();
    return () => {
      active = false;
    };
  }, [open, job]);

  const dur = parseInt(duration, 10) || WORKDAY_MINS;

  // Clashes for the currently-chosen slot.
  const conflicts = useMemo(() => {
    if (!start) return [];
    const segs = workdaySegments(new Date(start), dur);
    return clashesAgainst(segs, busy);
  }, [start, dur, busy]);

  // First upcoming weekday whose work day fits the job with no clash.
  const suggestion = useMemo(() => {
    const base = start ? new Date(start) : new Date();
    return nextFreeDay(base, dur, busy);
  }, [start, dur, busy]);

  async function save() {
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      const s = start ? new Date(start) : null;
      const e = s ? jobEnd(s, dur) : null;
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledStart: s ? s.toISOString() : null,
          scheduledEnd: e ? e.toISOString() : null,
          durationMins: dur,
          status: job.status === "lead" ? "scheduled" : job.status,
          notify,
        }),
      });
      setStart("");
      setBusy([]);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move the job — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={job ? `Reschedule — ${job.title}` : "Reschedule"}>
      <div className="space-y-4">
        <div>
          <label className="label">New start</label>
          <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">Duration</label>
          <div className="mb-2 flex gap-2">
            {[1, 2, 3, 4].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(String(d * WORKDAY_MINS))}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  parseInt(duration, 10) === d * WORKDAY_MINS ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300"
                }`}
              >
                {d} day{d > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <input className="input" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Minutes. One work day = {WORKDAY_MINS} (6:30am–3:00pm). Multi-day jobs spill onto the next working days.</p>
        </div>

        {/* Clash / capacity guard */}
        {conflicts.length > 0 ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <p className="font-semibold">⚠️ Clashes with {conflicts.length} other commitment{conflicts.length > 1 ? "s" : ""}:</p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.slice(0, 4).map((c, i) => (
                <li key={i} className="truncate">• {c.title} — {fmtDay(c.start)} {fmtRange(c.start, c.end)}</li>
              ))}
            </ul>
            {suggestion && (
              <button
                type="button"
                onClick={() => setStart(toLocalInput(suggestion))}
                className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Use next free day — {fmtDay(suggestion.toISOString())}
              </button>
            )}
          </div>
        ) : start ? (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">✓ No clashes for this slot</div>
        ) : null}

        <label className="flex items-center gap-3 text-sm text-stone-700 dark:text-slate-300">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-5 w-5 rounded accent-brand-600" />
          Email the client about the new time
        </label>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            {saving ? "Moving…" : conflicts.length > 0 ? "Move anyway" : "Move job"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Clash = { title: string; start: string; end: string };

/** Returns the busy items whose segments overlap any of the proposed segments. */
function clashesAgainst(segments: { start: Date; end: Date }[], busy: Busy[]): Clash[] {
  const out: Clash[] = [];
  for (const b of busy) {
    for (const bs of b.segments) {
      if (segments.some((s) => intervalsOverlap(s.start, s.end, bs.start, bs.end))) {
        out.push({ title: b.title, start: bs.start.toISOString(), end: bs.end.toISOString() });
        break;
      }
    }
  }
  return out;
}

/** Next weekday (within ~5 weeks) where the job fits at the work-day start with no clash. */
function nextFreeDay(after: Date, durationMins: number, busy: Busy[]): Date | null {
  const cursor = new Date(after);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 35; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue; // weekends
    const slot = new Date(cursor);
    slot.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
    const segs = workdaySegments(slot, durationMins);
    if (clashesAgainst(segs, busy).length === 0) return slot;
  }
  return null;
}

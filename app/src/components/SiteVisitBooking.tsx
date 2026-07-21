"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";
import { VISIT_META, type VisitType } from "@/lib/visits";

type Visit = {
  id: string;
  assigneeName: string | null;
  scheduledStart: string;
  notes: string | null;
  status: string;
  onCalendar: boolean;
};
type Staff = { id: string; name: string; role: string };
type Clash = { title: string; start: string; end: string };

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function SiteVisitBooking({ jobId, type }: { jobId: string; type: VisitType }) {
  const meta = VISIT_META[type];
  const [visits, setVisits] = useState<Visit[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [start, setStart] = useState("");
  const [durationMins, setDurationMins] = useState(meta.defaultMins);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { visits } = await api<{ visits: Visit[] }>(`/api/jobs/${jobId}/visits?type=${type}`);
      setVisits(visits.filter((v) => v.status !== "cancelled"));
    } catch {
      /* ignore */
    }
  }, [jobId, type]);

  useEffect(() => {
    load();
    api<{ staff: Staff[] }>("/api/staff").then((r) => setStaff(r.staff)).catch(() => {});
  }, [load]);

  async function book(force = false) {
    if (!start) { setError("Pick a date and time."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok?: boolean; clash?: Clash[] }>(`/api/jobs/${jobId}/visits`, {
        method: "POST",
        body: JSON.stringify({ type, start, durationMins, assigneeId: assigneeId || undefined, notes, force }),
      });
      if (res.clash && res.clash.length) { setClash(res.clash); return; }
      setOpen(false);
      setClash(null);
      setStart("");
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book the visit.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    await api(`/api/jobs/${jobId}/visits/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="card mb-3 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">{meta.label}</h2>
        {!open && (
          <button className="text-sm font-semibold text-brand-600" onClick={() => setOpen(true)}>
            {visits.length ? "Book another" : "Book"}
          </button>
        )}
      </div>

      {visits.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-700 dark:text-slate-200">
                {fmtWhen(v.scheduledStart)}
                {v.assigneeName ? ` · ${v.assigneeName}` : ""}
                {v.onCalendar ? "" : " · not on calendar"}
              </span>
              <button className="text-xs text-stone-400 hover:text-red-600" onClick={() => cancel(v.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      ) : (
        !open && <p className="text-sm text-stone-500 dark:text-slate-400">No {meta.label.toLowerCase()} booked yet.</p>
      )}

      {open && (
        <div className="mt-2 space-y-2.5">
          {staff.length > 0 && (
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Assign to… (optional)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input className="input flex-1" type="datetime-local" value={start} onChange={(e) => { setStart(e.target.value); setClash(null); }} />
            <select className="input w-28" value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hr</option>
              <option value={90}>1.5 hr</option>
              <option value={120}>2 hr</option>
            </select>
          </div>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />

          {clash && clash.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-semibold">Possible clash:</p>
              <ul className="mt-0.5 list-disc pl-4">
                {clash.map((c, i) => (<li key={i}>{c.title} — {fmtWhen(c.start)}</li>))}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            {clash && clash.length > 0 ? (
              <button className="btn-primary flex-1" disabled={busy} onClick={() => book(true)}>
                {busy ? "Booking…" : "Book anyway"}
              </button>
            ) : (
              <button className="btn-accent flex-1" disabled={busy} onClick={() => book(false)}>
                {busy ? "Booking…" : `Book ${meta.label.toLowerCase()}`}
              </button>
            )}
            <button className="btn-ghost" onClick={() => { setOpen(false); setClash(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

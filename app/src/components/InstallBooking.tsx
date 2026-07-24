"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";

type Installer = { id: string; name: string; role: string; color: string };
type Booking = { id: string; start: string; end: string | null; durationDays: number; crewIds: string[]; notes: string | null; onCalendar: boolean };
type Clash = { title: string; start: string; end: string };
type Data = { installers: Installer[]; dispatchReady: boolean; dispatchNote: string | null; visit: Booking | null };

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Multi-day crewed install booking (P10.1). Gated on the job's parts being
// scanned out of the factory (overridable); clash-checks the crew + calendar.
export function InstallBooking({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [days, setDays] = useState(1);
  const [crew, setCrew] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash[] | null>(null);
  const [override, setOverride] = useState<{ message: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/jobs/${jobId}/install`)); } catch { /* ignore */ }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  function toggleCrew(id: string) {
    setCrew((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function book(force = false, override = false, reason?: string) {
    if (!start) { setError("Pick a start date and time."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start, durationDays: days, crewIds: crew, notes, force, override, reason }),
      });
      if (res.status === 409) {
        const b = await res.json().catch(() => ({}));
        if (b.needsOverride) {
          // Collect the override reason inline — window.prompt is unreliable in
          // the installed PWA, so the override was previously unreachable there.
          setOverride({ message: b.error || "This install is on hold.", reason: "" });
          return;
        }
        setError(b.error || "Couldn't book the install.");
        return;
      }
      const b = await res.json().catch(() => ({}));
      if (b.clash && b.clash.length) { setClash(b.clash); return; }
      if (!res.ok) { setError(b.error || "Couldn't book the install."); return; }
      setOpen(false); setClash(null); setOverride(null); setStart(""); setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book the install.");
    } finally { setBusy(false); }
  }

  if (!data) return null;
  const crewNames = (ids: string[]) => data.installers.filter((i) => ids.includes(i.id)).map((i) => i.name).join(", ");

  return (
    <div className="card mb-3 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Installation</h2>
        {!open && <button className="text-sm font-semibold text-brand-600" onClick={() => setOpen(true)}>{data.visit ? "Rebook" : "Book install"}</button>}
      </div>

      {!data.dispatchReady && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">⚠ {data.dispatchNote} — you can still book with an override.</p>
      )}

      {data.visit ? (
        <div className="mb-2 text-sm text-stone-700 dark:text-slate-200">
          <p className="font-medium">{fmtWhen(data.visit.start)}{data.visit.durationDays > 1 ? ` · ${data.visit.durationDays} days` : ""}</p>
          {data.visit.crewIds.length > 0 && <p className="text-stone-500 dark:text-slate-400">Crew: {crewNames(data.visit.crewIds)}</p>}
          {!data.visit.onCalendar && <p className="text-xs text-stone-400 dark:text-slate-500">Not on calendar (demo — connect Google to sync)</p>}
        </div>
      ) : (!open && <p className="text-sm text-stone-500 dark:text-slate-400">No installation booked yet.</p>)}

      {open && (
        <div className="mt-2 space-y-2.5">
          <div className="flex gap-2">
            <input className="input flex-1" type="datetime-local" value={start} onChange={(e) => { setStart(e.target.value); setClash(null); }} />
            <select className="input w-28" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Crew</p>
            <div className="flex flex-wrap gap-1.5">
              {data.installers.map((i) => (
                <button
                  key={i.id}
                  onClick={() => toggleCrew(i.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${crew.includes(i.id) ? "text-white" : "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300"}`}
                  style={crew.includes(i.id) ? { backgroundColor: i.color } : undefined}
                >
                  {i.name}
                </button>
              ))}
              {data.installers.length === 0 && <p className="text-sm text-stone-400 dark:text-slate-500">No installers set up yet — add them in Installers.</p>}
            </div>
          </div>

          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (gate code, parking, access…)" />

          {clash && clash.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-semibold">Possible clash:</p>
              <ul className="mt-0.5 list-disc pl-4">{clash.map((c, i) => <li key={i}>{c.title} — {fmtWhen(c.start)}</li>)}</ul>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {override && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-semibold">{override.message}</p>
              <input
                className="input mt-2"
                placeholder="Reason to book anyway"
                aria-label="Override reason"
                value={override.reason}
                onChange={(e) => setOverride((o) => (o ? { ...o, reason: e.target.value } : o))}
              />
              <button
                className="btn-primary mt-2 w-full"
                disabled={busy || !override.reason.trim()}
                onClick={() => book(false, true, override.reason.trim())}
              >
                {busy ? "Booking…" : "Book anyway (override)"}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {clash && clash.length > 0 ? (
              <button className="btn-primary flex-1" disabled={busy} onClick={() => book(true)}>{busy ? "Booking…" : "Book anyway"}</button>
            ) : (
              <button className="btn-accent flex-1" disabled={busy} onClick={() => book(false)}>{busy ? "Booking…" : "Book install"}</button>
            )}
            <button className="btn-ghost" onClick={() => { setOpen(false); setClash(null); setError(null); setOverride(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

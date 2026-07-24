"use client";

import { useState } from "react";
import { api, type TradeVisitDTO } from "@/lib/job";
import { fmtDay, fmtTime, toLocalInput } from "@/lib/format";

const COMMON_TRADES = ["Plumber", "Electrician", "Stone templater", "Stone installer", "Tiler", "Painter", "Waterproofer"];

/** Admin view of a job's trade site schedule: list, add, mark done, remove.
 * The same visits show on the client's portal and the installer's job page. */
export function TradeSchedule({
  jobId,
  visits,
  onChanged,
}: {
  jobId: string;
  visits: TradeVisitDTO[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [trade, setTrade] = useState("");
  const [company, setCompany] = useState("");
  const [start, setStart] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!trade.trim() || !start) return setError("Trade and a date/time are needed.");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/trades`, {
        method: "POST",
        body: JSON.stringify({ trade: trade.trim(), company, scheduledStart: new Date(start).toISOString(), notes }),
      });
      setTrade("");
      setCompany("");
      setStart("");
      setNotes("");
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the visit");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(v: TradeVisitDTO, status: string) {
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/trades/${v.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the visit");
    }
  }
  async function remove(v: TradeVisitDTO) {
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/trades/${v.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the visit");
    }
  }

  return (
    <div>
      {visits.length === 0 && !adding && (
        <p className="mb-2 text-sm text-stone-400 dark:text-slate-500">
          Book the other trades against this site — the client sees the schedule on their portal.
        </p>
      )}

      {visits.length > 0 && (
        <ul className="mb-3 space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center gap-3 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  v.status === "done" ? "bg-emerald-500" : v.status === "cancelled" ? "bg-stone-300 dark:bg-slate-600" : "bg-sky-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${v.status === "cancelled" ? "text-stone-400 line-through dark:text-slate-500" : "text-stone-800 dark:text-slate-100"}`}>
                  {v.trade}
                  {v.company && <span className="font-normal text-stone-500 dark:text-slate-400"> · {v.company}</span>}
                </p>
                <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                  {fmtDay(v.scheduledStart)} · {fmtTime(v.scheduledStart)}
                  {v.notes ? ` · ${v.notes}` : ""}
                </p>
              </div>
              {v.status === "scheduled" ? (
                <button onClick={() => setStatus(v, "done")} className="shrink-0 text-xs font-semibold text-emerald-600">
                  Done
                </button>
              ) : (
                <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">{v.status}</span>
              )}
              <button
                onClick={() => remove(v)}
                className="shrink-0 rounded-full p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-500 dark:text-slate-600 dark:hover:bg-night-800"
                aria-label="Remove visit"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 dark:bg-night-850 dark:ring-night-line">
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TRADES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrade(t)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  trade === t
                    ? "bg-brand-600 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-night-800 dark:text-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input className="input" placeholder="Trade (e.g. Plumber)" value={trade} onChange={(e) => setTrade(e.target.value)} />
          <input className="input" placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="input" placeholder="Notes for the client (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 py-2" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 py-2" disabled={busy}>
              {busy ? "Adding…" : "Add visit"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm font-medium text-brand-600">
          + Book a trade visit
        </button>
      )}
    </div>
  );
}

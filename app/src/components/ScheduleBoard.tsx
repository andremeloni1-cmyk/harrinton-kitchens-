"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { addDays, parseDay, type UtilCell } from "@/lib/capacity";

type StationDTO = { id: string; name: string; hoursPerDay: number };
type BlockDTO = { id: string; jobId: string; jobRef: string; jobTitle: string; stationId: string; day: string; hours: number };
type RiskDTO = { id: string; reference: string; title: string; dueDate: string | null; lastDay: string | null; scheduled: boolean; atRisk: boolean; reason: string | null };
type Data = { weekStart: string; days: string[]; stations: StationDTO[]; cells: UtilCell[]; blocks: BlockDTO[]; risk: RiskDTO[] };

function fmtCol(day: string): string {
  return parseDay(day).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" });
}
function heat(cell: UtilCell | undefined): string {
  if (!cell) return "bg-white dark:bg-night-900";
  if (cell.overloaded) return "bg-red-100 ring-1 ring-red-300 dark:bg-red-500/20 dark:ring-red-500/40";
  if (cell.capacity === 0) return "bg-stone-100 dark:bg-night-950";
  if (cell.pct === 0) return "bg-white dark:bg-night-900";
  if (cell.pct <= 70) return "bg-emerald-50 dark:bg-emerald-500/10";
  return "bg-amber-50 dark:bg-amber-500/10";
}

export function ScheduleBoard() {
  const [week, setWeek] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<Data>(`/api/factory/schedule?week=${week}`)); }
    finally { setLoading(false); }
  }, [week]);
  useEffect(() => { load(); }, [load]);

  async function moveBlock(blockId: string, stationId: string, day: string) {
    setData((d) => d && { ...d, blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, stationId, day } : b)) }); // optimistic
    await api(`/api/factory/schedule/blocks/${blockId}`, { method: "PATCH", body: JSON.stringify({ stationId, day }) }).catch(() => {});
    await load();
  }
  async function autoSchedule(jobId: string) {
    setBusy(jobId);
    try { await api(`/api/factory/schedule/auto`, { method: "POST", body: JSON.stringify({ jobId }) }); await load(); }
    finally { setBusy(null); }
  }

  const overloadCount = data ? data.cells.filter((c) => c.overloaded).length : 0;
  const cellOf = (stationId: string, day: string) => data?.cells.find((c) => c.stationId === stationId && c.day === day);
  const blocksIn = (stationId: string, day: string) => data?.blocks.filter((b) => b.stationId === stationId && b.day === day) ?? [];

  return (
    <div className="px-4 pt-5 pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/factory" className="text-sm font-medium text-stone-400 hover:text-stone-600 dark:text-slate-500">← Factory</Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Schedule</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">Station capacity by day · drag a block to rebalance</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg bg-stone-100 px-2.5 py-2 text-sm font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300" onClick={() => setWeek(addDays(week, -7))}>←</button>
          <button className="rounded-lg bg-stone-100 px-2.5 py-2 text-sm font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300" onClick={() => setWeek(new Date().toISOString().slice(0, 10))}>This week</button>
          <button className="rounded-lg bg-stone-100 px-2.5 py-2 text-sm font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300" onClick={() => setWeek(addDays(week, 7))}>→</button>
        </div>
      </header>

      {overloadCount > 0 && (
        <div className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
          ⚠ {overloadCount} overloaded station-day{overloadCount === 1 ? "" : "s"} this week — rebalance below.
        </div>
      )}

      {loading && !data ? (
        <div className="text-sm text-stone-400 dark:text-slate-500">Loading the schedule…</div>
      ) : data && (
        <>
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-28 text-left text-xs font-semibold text-stone-400 dark:text-slate-500"></th>
                  {data.days.map((d) => (
                    <th key={d} className="text-center text-xs font-semibold text-stone-500 dark:text-slate-400">{fmtCol(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stations.map((s) => (
                  <tr key={s.id}>
                    <td className="align-top text-sm font-semibold text-stone-700 dark:text-slate-200">
                      {s.name}
                      <span className="block text-[10px] font-normal text-stone-400 dark:text-slate-500">{s.hoursPerDay}h/day</span>
                    </td>
                    {data.days.map((day) => {
                      const cell = cellOf(s.id, day);
                      const blocks = blocksIn(s.id, day);
                      return (
                        <td
                          key={day}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (drag) moveBlock(drag, s.id, day); setDrag(null); }}
                          className={`h-20 w-24 rounded-lg p-1 align-top ${heat(cell)}`}
                        >
                          {cell && cell.capacity > 0 && (
                            <div className={`mb-1 text-center text-[10px] font-semibold ${cell.overloaded ? "text-red-600 dark:text-red-300" : "text-stone-400 dark:text-slate-500"}`}>
                              {cell.booked}/{cell.capacity}h
                            </div>
                          )}
                          <div className="space-y-1">
                            {blocks.map((b) => (
                              <div
                                key={b.id}
                                draggable
                                onDragStart={() => setDrag(b.id)}
                                onDragEnd={() => setDrag(null)}
                                title={`${b.jobTitle} · ${b.hours}h`}
                                className="cursor-grab rounded-md bg-brand-500 px-1.5 py-1 text-[10px] font-semibold leading-tight text-white active:cursor-grabbing"
                              >
                                <span className="block truncate">{b.jobRef}</span>
                                <span className="opacity-80">{b.hours}h</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Jobs in production + scheduling status */}
          <div className="mt-5">
            <h2 className="mb-2 text-sm font-bold text-stone-700 dark:text-slate-200">Jobs in production ({data.risk.length})</h2>
            {data.risk.length === 0 && <p className="text-sm text-stone-400 dark:text-slate-500">No jobs in production.</p>}
            <div className="space-y-2">
              {data.risk.map((j) => (
                <div key={j.id} className={`card flex items-center justify-between gap-3 p-3 ${j.atRisk ? "ring-1 ring-red-200 dark:ring-red-500/30" : ""}`}>
                  <div className="min-w-0">
                    <Link href={`/jobs/${j.id}`} className="truncate font-semibold text-stone-900 hover:underline dark:text-slate-100">{j.title}</Link>
                    <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                      {j.reference}
                      {j.dueDate ? ` · install ${j.dueDate}` : " · no install date"}
                      {j.atRisk && j.reason ? <span className="text-red-600 dark:text-red-300"> · {j.reason}</span> : j.scheduled ? " · on track" : ""}
                    </p>
                  </div>
                  <button
                    className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={busy === j.id}
                    onClick={() => autoSchedule(j.id)}
                  >
                    {busy === j.id ? "…" : j.scheduled ? "Re-schedule" : "Auto-schedule"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

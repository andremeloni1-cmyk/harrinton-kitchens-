"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { BriefCard } from "@/components/BriefCard";
import { fmtDay } from "@/lib/format";
import { currentStation, factoryProgress, parseChecklist, type ChecklistItem } from "@/lib/factory";
import { api } from "@/lib/job";

type JobStationDTO = {
  id: string; stationId: string; position: number; status: string;
  blocked: boolean; blockerNote: string | null; notes: string | null; checklist: string;
};
type PartProg = { stationId: string; done: number; total: number; pct: number };
type BoardJob = {
  id: string; reference: string; title: string; clientName: string | null;
  scheduledStart: string | null; stations: JobStationDTO[];
  partsTotal: number; partProgress: PartProg[];
  cabinets: { id: string; name: string; qcPassedAt: string | null }[];
};
type Station = { id: string; name: string; position: number };

export function FactoryBoard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ job: BoardJob; js: JobStationDTO } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [override, setOverride] = useState<{ jobId: string; message: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ stations: Station[]; jobs: BoardJob[] }>("/api/factory/board");
      setStations(data.stations);
      setJobs(data.jobs);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function moveTo(jobId: string, toStationId: string) {
    setJobs((prev) => prev); // keep UI; optimistic reload after
    await api(`/api/factory/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ toStationId }) }).catch(() => {});
    await load();
  }
  async function advance(job: BoardJob) {
    const cur = currentStation(job.stations);
    if (!cur) return;
    const next = job.stations.find((s) => s.position === cur.position + 1);
    if (next) await moveTo(job.id, next.stationId);
    else await finishProduction(job.id);
  }
  // Finish production, honouring the QC / dispatch hold-backs: a 409 surfaces an
  // override prompt in a Modal (window.prompt is unreliable in the installed PWA,
  // so the override was previously unreachable there) (P8.3 / P1-5).
  async function finishProduction(jobId: string, withOverride?: { reason: string }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/factory/jobs/${jobId}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withOverride ? { override: true, reason: withOverride.reason } : {}),
      });
      if (res.status === 409) {
        const b = await res.json().catch(() => ({}));
        if (b.needsOverride) {
          setOverride({ jobId, message: b.error || "This job is on hold.", reason: "" });
          return;
        }
      }
      setOverride(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading the factory board…</div>;

  const jobsAt = (stationId: string) =>
    jobs.filter((j) => currentStation(j.stations)?.stationId === stationId);

  return (
    <div className="px-4 pt-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Factory</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">{jobs.length} job{jobs.length === 1 ? "" : "s"} in production · drag a card to move it along the line</p>
        </div>
        <Link href="/factory/schedule" className="shrink-0 rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300">📅 Schedule</Link>
      </header>

      <BriefCard />

      {jobs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-stone-500 dark:text-slate-400">No jobs in production yet. Jobs appear here when they reach the PRODUCTION stage.</div>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-4">
          {stations.map((station) => {
            const colJobs = jobsAt(station.id);
            return (
              <div
                key={station.id}
                className="flex w-64 shrink-0 flex-col rounded-2xl bg-stone-50 p-2 dark:bg-night-900"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) moveTo(dragId, station.id); setDragId(null); }}
              >
                <div className="mb-2 flex items-center justify-between px-2 py-1">
                  <span className="text-sm font-bold text-stone-700 dark:text-slate-200">{station.name}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500 dark:bg-night-800 dark:text-slate-400">{colJobs.length}</span>
                </div>
                <div className="space-y-2">
                  {colJobs.map((job) => {
                    const prog = factoryProgress(job.stations);
                    const blocked = job.stations.some((s) => s.blocked);
                    const cur = currentStation(job.stations);
                    const curJs = cur ? job.stations.find((s) => s.id === cur.id)! : null;
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={() => setDragId(job.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => curJs && setDetail({ job, js: curJs })}
                        className={`cursor-pointer rounded-xl bg-white p-3 shadow-sm ring-1 transition hover:shadow-md dark:bg-night-800 ${blocked ? "ring-red-300 dark:ring-red-500/40" : "ring-stone-100 dark:ring-night-line"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{job.title}</p>
                          {blocked && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">BLOCKED</span>}
                        </div>
                        <p className="truncate text-xs text-stone-500 dark:text-slate-400">{job.clientName || job.reference}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-stone-400 dark:text-slate-500">{fmtDay(job.scheduledStart)}</span>
                          <span className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">{prog.done}/{prog.total}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-night-700">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${prog.pct}%` }} />
                        </div>
                        {job.partsTotal > 0 && (
                          <div className="mt-2">
                            <div className="mb-0.5 flex items-center justify-between text-[10px] text-stone-400 dark:text-slate-500">
                              <span>parts through line</span>
                              <span>{job.partProgress[0]?.done ?? 0}/{job.partsTotal}</span>
                            </div>
                            <div className="flex h-4 items-end gap-0.5">
                              {job.partProgress.map((s) => (
                                <div
                                  key={s.stationId}
                                  title={`${stations.find((x) => x.id === s.stationId)?.name || ""}: ${s.done}/${s.total}`}
                                  className="flex flex-1 items-end overflow-hidden rounded-sm bg-stone-100 dark:bg-night-700"
                                >
                                  <div className="w-full bg-brand-400" style={{ height: `${Math.max(s.pct, 4)}%` }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <button
                          className="mt-2 w-full rounded-lg bg-brand-50 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          onClick={(e) => { e.stopPropagation(); advance(job); }}
                        >
                          {job.stations.every((s) => s.position <= (cur?.position ?? 0)) && cur?.position === stations.length - 1 ? "Finish production" : "Done here →"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.job.title}` : ""}>
        {detail && <StationDetail job={detail.job} js={detail.js} onSaved={() => { setDetail(null); load(); }} />}
      </Modal>

      <Modal open={!!override} onClose={() => setOverride(null)} title="Finish anyway?">
        {override && (
          <div>
            <p className="text-sm text-stone-600 dark:text-slate-300">{override.message}</p>
            <input
              className="input mt-3"
              placeholder="Reason to override"
              aria-label="Override reason"
              value={override.reason}
              onChange={(e) => setOverride((o) => (o ? { ...o, reason: e.target.value } : o))}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => setOverride(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={busy || !override.reason.trim()}
                onClick={() => finishProduction(override.jobId, { reason: override.reason.trim() })}
              >
                Finish anyway
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StationDetail({ job, js, onSaved }: { job: BoardJob; js: JobStationDTO; onSaved: () => void }) {
  const [items, setItems] = useState<ChecklistItem[]>(parseChecklist(js.checklist));
  const [newItem, setNewItem] = useState("");
  const [notes, setNotes] = useState(js.notes || "");
  const [blocked, setBlocked] = useState(js.blocked);
  const [blockerNote, setBlockerNote] = useState(js.blockerNote || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/factory/job-stations/${js.id}`, {
        method: "PATCH",
        body: JSON.stringify({ checklist: JSON.stringify(items), notes, blocked, blockerNote: blocked ? blockerNote : null }),
      });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500 dark:text-slate-400">{job.reference}</p>

      <div>
        <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-slate-200">Checklist</p>
        <div className="space-y-1">
          {items.map((it, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={it.done} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
              <span className={it.done ? "text-stone-400 line-through" : "text-stone-700 dark:text-slate-200"}>{it.label}</span>
              <button className="ml-auto text-xs text-stone-300 hover:text-red-500" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
            </label>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          <input className="input flex-1 py-1.5 text-sm" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step…" onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { setItems([...items, { label: newItem.trim(), done: false }]); setNewItem(""); } }} />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-slate-200">Notes</span>
        <textarea className="input min-h-[60px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="rounded-xl bg-stone-50 p-3 dark:bg-night-800">
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
          <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
          Blocked — needs the office
        </label>
        {blocked && <input className="input mt-2 py-1.5 text-sm" value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} placeholder="What's the blocker?" />}
      </div>

      <button className="btn-accent w-full" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}

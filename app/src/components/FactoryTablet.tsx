"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";
import { currentStation, factoryProgress, isQcStation, type ChecklistItem } from "@/lib/factory";
import { parseChecklist } from "@/lib/factory";
import { FactoryScanner } from "./FactoryScanner";

type JobStationDTO = {
  id: string; stationId: string; position: number; status: string;
  blocked: boolean; blockerNote: string | null; notes: string | null; checklist: string;
};
type CabinetDTO = { id: string; name: string; qcPassedAt: string | null };
type BoardJob = {
  id: string; reference: string; title: string; clientName: string | null; scheduledStart: string | null;
  stations: JobStationDTO[]; partsTotal: number; cabinets: CabinetDTO[];
};
type Station = { id: string; name: string; position: number };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function FactoryTablet() {
  const [stations, setStations] = useState<Station[]>([]);
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [stationId, setStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ stations: Station[]; jobs: BoardJob[] }>("/api/factory/board");
      setStations(data.stations);
      setJobs(data.jobs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setStationId(localStorage.getItem("factory-station"));
    load();
  }, [load]);

  function pick(id: string) {
    localStorage.setItem("factory-station", id);
    setStationId(id);
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;

  const station = stations.find((s) => s.id === stationId) || null;

  // No station chosen yet — big picker.
  if (!station) {
    return (
      <div className="px-4 pt-6">
        <h1 className="mb-1 text-2xl font-bold text-stone-900 dark:text-slate-100">Which station?</h1>
        <p className="mb-4 text-sm text-stone-500 dark:text-slate-400">Pick where you’re working — we’ll remember it.</p>
        <div className="grid grid-cols-2 gap-3">
          {stations.map((s) => (
            <button key={s.id} onClick={() => pick(s.id)} className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-8 text-lg font-bold text-white shadow-sm active:scale-[0.98]">
              {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const nowJobs = jobs.filter((j) => currentStation(j.stations)?.stationId === station.id);
  const nextJobs = jobs.filter((j) => currentStation(j.stations)?.position === station.position - 1);

  return (
    <div className="px-4 pt-5 pb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your station</p>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-slate-100">{station.name}</h1>
        </div>
        <div className="flex gap-2">
          <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white active:scale-95" onClick={() => setScanning(true)}>📷 Scan</button>
          <button className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-600 dark:bg-night-800 dark:text-slate-300" onClick={() => setStationId(null)}>Change</button>
        </div>
      </div>

      {scanning && (
        <FactoryScanner stationId={station.id} stationName={station.name} onClose={() => setScanning(false)} />
      )}

      <p className="mb-2 text-sm font-bold text-stone-700 dark:text-slate-200">At your station now ({nowJobs.length})</p>
      <div className="space-y-3">
        {nowJobs.length === 0 && <div className="card p-6 text-center text-sm text-stone-500 dark:text-slate-400">Nothing here right now. 👍</div>}
        {nowJobs.map((job) => {
          const js = job.stations.find((s) => s.id === currentStation(job.stations)?.id)!;
          return <NowCard key={job.id} job={job} js={js} stationName={station.name} onChanged={load} />;
        })}
      </div>

      {nextJobs.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-sm font-bold text-stone-500 dark:text-slate-400">Coming up ({nextJobs.length})</p>
          <div className="space-y-2">
            {nextJobs.map((job) => (
              <div key={job.id} className="card flex items-center justify-between p-3.5 opacity-80">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{job.title}</p>
                  <p className="truncate text-xs text-stone-400 dark:text-slate-500">{job.clientName || job.reference}</p>
                </div>
                <span className="text-xs text-stone-400">next</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NowCard({ job, js, stationName, onChanged }: { job: BoardJob; js: JobStationDTO; stationName: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | "done" | "photo" | "block" | "qc">(null);
  const items: ChecklistItem[] = parseChecklist(js.checklist);
  const prog = factoryProgress(job.stations);
  const fileRef = useRef<HTMLInputElement>(null);
  const isQc = isQcStation(stationName);
  const cabinets = job.cabinets;
  const qcPassed = cabinets.filter((c) => c.qcPassedAt).length;

  async function toggleQc(cab: CabinetDTO) {
    setBusy("qc");
    try {
      await api(`/api/factory/jobs/${job.id}/cabinets/${cab.id}/qc`, { method: "POST", body: JSON.stringify({ passed: !cab.qcPassedAt }) });
      await onChanged();
    } finally { setBusy(null); }
  }

  async function complete(override?: boolean, reason?: string) {
    setBusy("done");
    try {
      const res = await fetch(`/api/factory/job-stations/${js.id}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(override ? { override: true, reason } : {}),
      });
      if (res.status === 409) {
        const b = await res.json().catch(() => ({}));
        if (b.needsOverride) {
          const r = window.prompt(`${b.error}\n\nComplete anyway? Enter a reason to override:`);
          if (r && r.trim()) await complete(true, r.trim());
          return;
        }
      }
      await onChanged();
    } finally { setBusy(null); }
  }
  async function toggleBlock() {
    setBusy("block");
    try {
      await api(`/api/factory/job-stations/${js.id}`, { method: "PATCH", body: JSON.stringify({ blocked: !js.blocked, blockerNote: js.blocked ? null : "Raised on the floor" }) });
      await onChanged();
    } finally { setBusy(null); }
  }
  async function photo(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy("photo");
    try {
      const fileData = await fileToBase64(files[0]);
      await api(`/api/factory/job-stations/${js.id}/photo`, { method: "POST", body: JSON.stringify({ fileData }) });
      await onChanged();
    } catch { /* ignore */ }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className={`card p-4 ${js.blocked ? "ring-2 ring-red-400 dark:ring-red-500/50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-stone-900 dark:text-slate-100">{job.title}</p>
          <p className="truncate text-sm text-stone-500 dark:text-slate-400">{job.clientName || job.reference}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-stone-400">{prog.done}/{prog.total}</span>
      </div>

      {items.length > 0 && (
        <p className="mt-1.5 text-sm text-stone-500 dark:text-slate-400">{items.filter((i) => i.done).length}/{items.length} steps · {items.filter((i) => !i.done).map((i) => i.label).slice(0, 2).join(", ")}</p>
      )}

      {js.blocked && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">⚠ Blocked{js.blockerNote ? ` — ${js.blockerNote}` : ""}</p>
      )}

      {isQc && cabinets.length > 0 && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 dark:bg-night-800">
          <p className="mb-2 text-sm font-bold text-stone-700 dark:text-slate-200">QC sign-off · {qcPassed}/{cabinets.length} cabinets</p>
          <div className="space-y-1.5">
            {cabinets.map((c) => (
              <button
                key={c.id}
                disabled={busy !== null}
                onClick={() => toggleQc(c)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold active:scale-[0.99] disabled:opacity-60 ${c.qcPassedAt ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-night-900 dark:text-slate-200 dark:ring-night-line"}`}
              >
                <span>{c.name}</span>
                <span>{c.qcPassedAt ? "✓ Passed" : "Tap to pass"}</span>
              </button>
            ))}
          </div>
          {qcPassed < cabinets.length && <p className="mt-2 text-xs text-stone-400 dark:text-slate-500">All cabinets must pass before QC completes.</p>}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className="rounded-xl bg-brand-600 py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50" disabled={busy !== null} onClick={() => complete()}>
          {busy === "done" ? "…" : "✓ Done"}
        </button>
        <button className="rounded-xl bg-stone-100 py-4 text-base font-bold text-stone-700 active:scale-[0.98] disabled:opacity-50 dark:bg-night-800 dark:text-slate-200" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          {busy === "photo" ? "…" : "📷 Photo"}
        </button>
        <button className={`rounded-xl py-4 text-base font-bold active:scale-[0.98] disabled:opacity-50 ${js.blocked ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"}`} disabled={busy !== null} onClick={toggleBlock}>
          {busy === "block" ? "…" : js.blocked ? "✓ Resolve" : "⚠ Block"}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo(e.target.files)} />
    </div>
  );
}

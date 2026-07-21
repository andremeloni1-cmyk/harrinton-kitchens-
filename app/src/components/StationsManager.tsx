"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

type Station = { id: string; name: string; position: number; hoursPerDay: number; active: boolean };

export function StationsManager() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function load() {
    try {
      const { stations } = await api<{ stations: Station[] }>("/api/stations");
      setStations(stations);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { load(); }, []);

  const active = stations.filter((s) => s.active);

  async function add() {
    if (!newName.trim()) return;
    setBusy("add");
    try {
      await api("/api/stations", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      await load();
    } finally { setBusy(null); }
  }
  async function patch(id: string, data: Record<string, unknown>) {
    setBusy(id);
    try {
      await api(`/api/stations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await load();
    } finally { setBusy(null); }
  }
  async function deactivate(id: string) {
    setBusy(id);
    try {
      await api(`/api/stations/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(null); }
  }
  async function move(id: string, dir: "up" | "down") {
    const idx = active.findIndex((s) => s.id === id);
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= active.length) return;
    const reordered = [...active];
    [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
    const order = [...reordered, ...stations.filter((s) => !s.active)].map((s) => s.id);
    setBusy("reorder");
    try {
      const { stations: fresh } = await api<{ stations: Station[] }>("/api/stations", { method: "PATCH", body: JSON.stringify({ order }) });
      setStations(fresh);
    } finally { setBusy(null); }
  }

  if (!loaded) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Factory stations</h2>
      <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">The production line jobs move through. Reorder, rename, or set each station’s hours per day.</p>

      <div className="space-y-2">
        {active.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button className="px-1 text-stone-400 hover:text-brand-600 disabled:opacity-30" disabled={i === 0 || busy !== null} onClick={() => move(s.id, "up")} aria-label="Move up">▲</button>
              <button className="px-1 text-stone-400 hover:text-brand-600 disabled:opacity-30" disabled={i === active.length - 1 || busy !== null} onClick={() => move(s.id, "down")} aria-label="Move down">▼</button>
            </div>
            <input
              className="input flex-1"
              defaultValue={s.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) patch(s.id, { name: v }); }}
            />
            <div className="flex w-24 items-center gap-1">
              <input
                className="input w-14 text-right"
                type="number"
                step="0.5"
                defaultValue={s.hoursPerDay}
                onBlur={(e) => { const h = Number(e.target.value); if (h !== s.hoursPerDay) patch(s.id, { hoursPerDay: h }); }}
              />
              <span className="text-xs text-stone-400">h/day</span>
            </div>
            <button className="px-1.5 text-stone-400 hover:text-red-600" disabled={busy !== null} onClick={() => deactivate(s.id)} aria-label="Remove">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input className="input flex-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a station…" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="btn-secondary" disabled={busy === "add" || !newName.trim()} onClick={add}>{busy === "add" ? "…" : "Add"}</button>
      </div>
    </section>
  );
}

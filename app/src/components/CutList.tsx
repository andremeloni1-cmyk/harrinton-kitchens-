"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";
import type { CutList as CutListData, ExtractedPart } from "@/lib/cutlist";

type SavedPart = { id: string; name: string; material: string | null; edging: string | null; widthMm: number | null; heightMm: number | null; qty: number };
type SavedCabinet = { id: string; name: string; parts: SavedPart[] };
type Saved = { cabinets: SavedCabinet[]; hardware: { id: string; name: string; qty: number }[] };

const emptyPart = (): ExtractedPart => ({ name: "", material: "", edging: "", widthMm: null, heightMm: null, qty: 1 });

export function CutList({ jobId }: { jobId: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [review, setReview] = useState<CutListData | null>(null);
  const [busy, setBusy] = useState<null | "extract" | "confirm">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setSaved(await api<Saved>(`/api/jobs/${jobId}/cutlist`));
    } catch {
      /* ignore */
    }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  async function extract(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy("extract");
    setMsg(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files).slice(0, 5)) fd.append("files", f);
      const res = await fetch(`/api/jobs/${jobId}/cutlist/extract`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(body.error || "Couldn't read the file."); return; }
      if (!body.cutlist) { setMsg(body.message || "Couldn't read a cut list."); return; }
      setReview(body.cutlist);
    } catch {
      setMsg("Couldn't read the file — check your connection.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirm() {
    if (!review) return;
    setBusy("confirm");
    try {
      await api(`/api/jobs/${jobId}/cutlist`, { method: "POST", body: JSON.stringify({ cutlist: review }) });
      setReview(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(null); }
  }

  // --- review editors (immutable) ---
  const mut = (fn: (cl: CutListData) => CutListData) => setReview((cl) => (cl ? fn(structuredClone(cl)) : cl));

  if (review) {
    return (
      <div className="card mb-3 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Review cut list</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">Check the AI’s reading before saving — edit anything that’s off.</p>

        <div className="space-y-4">
          {review.cabinets.map((cab, ci) => (
            <div key={ci} className="rounded-xl border border-stone-100 p-3 dark:border-night-line">
              <div className="mb-2 flex items-center gap-2">
                <input className="input flex-1 font-semibold" value={cab.name} onChange={(e) => mut((cl) => { cl.cabinets[ci].name = e.target.value; return cl; })} />
                <button className="text-stone-400 hover:text-red-600" onClick={() => mut((cl) => { cl.cabinets.splice(ci, 1); return cl; })}>✕</button>
              </div>
              <div className="space-y-1.5">
                {cab.parts.map((p, pi) => (
                  <div key={pi} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <input className="input min-w-0 flex-1 py-1.5 text-sm" placeholder="Part" value={p.name} onChange={(e) => mut((cl) => { cl.cabinets[ci].parts[pi].name = e.target.value; return cl; })} />
                    <input className="input w-24 py-1.5 text-sm" placeholder="Material" value={p.material} onChange={(e) => mut((cl) => { cl.cabinets[ci].parts[pi].material = e.target.value; return cl; })} />
                    <input className="input w-16 py-1.5 text-right text-sm" placeholder="W" type="number" value={p.widthMm ?? ""} onChange={(e) => mut((cl) => { cl.cabinets[ci].parts[pi].widthMm = e.target.value === "" ? null : Number(e.target.value); return cl; })} />
                    <input className="input w-16 py-1.5 text-right text-sm" placeholder="H" type="number" value={p.heightMm ?? ""} onChange={(e) => mut((cl) => { cl.cabinets[ci].parts[pi].heightMm = e.target.value === "" ? null : Number(e.target.value); return cl; })} />
                    <input className="input w-12 py-1.5 text-right text-sm" type="number" value={p.qty} onChange={(e) => mut((cl) => { cl.cabinets[ci].parts[pi].qty = Number(e.target.value) || 1; return cl; })} />
                    <button className="px-1 text-stone-300 hover:text-red-500" onClick={() => mut((cl) => { cl.cabinets[ci].parts.splice(pi, 1); return cl; })}>✕</button>
                  </div>
                ))}
              </div>
              <button className="btn-ghost mt-1.5 text-sm text-brand-600" onClick={() => mut((cl) => { cl.cabinets[ci].parts.push(emptyPart()); return cl; })}>+ Part</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => mut((cl) => { cl.cabinets.push({ name: "New cabinet", parts: [emptyPart()] }); return cl; })}>+ Cabinet</button>

          {review.hardware.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-slate-200">Hardware</p>
              {review.hardware.map((h, hi) => (
                <div key={hi} className="mb-1.5 flex items-center gap-2 text-sm">
                  <input className="input flex-1 py-1.5 text-sm" value={h.name} onChange={(e) => mut((cl) => { cl.hardware[hi].name = e.target.value; return cl; })} />
                  <input className="input w-14 py-1.5 text-right text-sm" type="number" value={h.qty} onChange={(e) => mut((cl) => { cl.hardware[hi].qty = Number(e.target.value) || 1; return cl; })} />
                  <button className="px-1 text-stone-300 hover:text-red-500" onClick={() => mut((cl) => { cl.hardware.splice(hi, 1); return cl; })}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn-accent flex-1" disabled={busy === "confirm"} onClick={confirm}>{busy === "confirm" ? "Saving…" : "Save cut list"}</button>
          <button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  const partCount = saved ? saved.cabinets.reduce((s, c) => s + c.parts.length, 0) : 0;

  return (
    <div className="card mb-3 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Cut list</h2>
      </div>

      {saved && saved.cabinets.length > 0 ? (
        <>
          <p className="mb-2 text-sm text-stone-500 dark:text-slate-400">{saved.cabinets.length} cabinets · {partCount} parts · {saved.hardware.length} hardware</p>
          <div className="space-y-1">
            {saved.cabinets.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-medium text-stone-800 dark:text-slate-100">{c.name}</span>
                <span className="text-stone-400 dark:text-slate-500"> · {c.parts.length} parts</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mb-2 text-sm text-stone-500 dark:text-slate-400">No parts yet. Upload the CAD cut-list PDF and AI will read it for review.</p>
      )}

      {msg && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{msg}</p>}

      <div className="mt-3 flex gap-2">
        <button className="btn-accent" disabled={busy === "extract"} onClick={() => fileRef.current?.click()}>
          {busy === "extract" ? "Reading…" : saved && saved.cabinets.length > 0 ? "Re-extract from PDF" : "Extract from PDF"}
        </button>
        <button className="btn-secondary" onClick={() => setReview({ cabinets: [{ name: "Cabinet 1", parts: [emptyPart()] }], hardware: [] })}>Enter by hand</button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => extract(e.target.files)} />
      </div>
    </div>
  );
}

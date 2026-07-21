"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";

type Snag = { id: string; note: string; status: string; assigneeName: string | null; raisedByName: string | null; photoUrl: string | null; proofUrl: string | null; createdAt: string; resolvedAt: string | null };
type Installer = { id: string; name: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Office snag tracker (P10.3): raise (note + photo + assignee), resolve with a
// proof photo, reopen. The open→resolved trail with photos lives here; the
// portal shows only client-safe counts.
export function SnagList({ jobId }: { jobId: string }) {
  const [snags, setSnags] = useState<Snag[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const proofRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try { const d = await api<{ snags: Snag[] }>(`/api/jobs/${jobId}/snags`); setSnags(d.snags); } catch { /* ignore */ }
  }, [jobId]);
  useEffect(() => {
    load();
    api<{ installers: Installer[] }>("/api/installers").then((r) => setInstallers(r.installers)).catch(() => {});
  }, [load]);

  async function raise() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const fileData = photo ? await fileToBase64(photo) : undefined;
      await api(`/api/jobs/${jobId}/snags`, { method: "POST", body: JSON.stringify({ note, assigneeId: assigneeId || undefined, fileData, mimeType: photo?.type }) });
      setNote(""); setAssigneeId(""); setPhoto(null);
      await load();
    } finally { setBusy(false); }
  }

  async function resolve(id: string, file: File | null) {
    setBusy(true);
    try {
      const fileData = file ? await fileToBase64(file) : undefined;
      await api(`/api/jobs/${jobId}/snags/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", fileData, mimeType: file?.type }) });
      await load();
    } finally { setBusy(false); }
  }
  async function reopen(id: string) {
    setBusy(true);
    try { await api(`/api/jobs/${jobId}/snags/${id}`, { method: "PATCH", body: JSON.stringify({ status: "open" }) }); await load(); }
    finally { setBusy(false); }
  }

  const open = snags.filter((s) => s.status === "open");
  const resolved = snags.filter((s) => s.status === "resolved");

  return (
    <div className="card mb-3 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Snag list</h2>
        <span className="text-xs text-stone-400 dark:text-slate-500">{open.length} open · {resolved.length} done</span>
      </div>

      {/* Raise */}
      <div className="mb-3 space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-night-800">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs fixing?" />
        <div className="flex gap-2">
          <select className="input flex-1" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Assign to… (optional)</option>
            {installers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <label className="btn-secondary cursor-pointer whitespace-nowrap">
            {photo ? "1 photo" : "📷 Photo"}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <button className="btn-accent w-full" disabled={busy || !note.trim()} onClick={raise}>{busy ? "…" : "Raise snag"}</button>
      </div>

      {snags.length === 0 && <p className="text-sm text-stone-500 dark:text-slate-400">No snags — clean handover. ✨</p>}

      {open.length > 0 && (
        <div className="space-y-2">
          {open.map((s) => (
            <div key={s.id} className="rounded-xl border border-stone-100 p-3 dark:border-night-line">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800 dark:text-slate-100">{s.note}</p>
                  <p className="text-xs text-stone-400 dark:text-slate-500">{s.assigneeName ? `→ ${s.assigneeName}` : "Unassigned"}{s.raisedByName ? ` · raised by ${s.raisedByName}` : ""}</p>
                </div>
                {s.photoUrl && <a href={s.photoUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-brand-600">Photo</a>}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => proofRefs.current[s.id]?.click()}>✓ Resolve with photo</button>
                <button className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600 disabled:opacity-50 dark:bg-night-800 dark:text-slate-300" disabled={busy} onClick={() => resolve(s.id, null)}>Resolve</button>
                <input ref={(el) => { proofRefs.current[s.id] = el; }} type="file" accept="image/*" capture="environment" hidden onChange={(e) => resolve(s.id, e.target.files?.[0] ?? null)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Resolved</p>
          <div className="space-y-1.5">
            {resolved.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 dark:bg-night-800">
                <p className="min-w-0 truncate text-sm text-stone-500 line-through dark:text-slate-400">{s.note}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {s.proofUrl && <a href={s.proofUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600">Proof</a>}
                  <button className="text-xs text-stone-400 hover:text-stone-600" disabled={busy} onClick={() => reopen(s.id)}>Reopen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

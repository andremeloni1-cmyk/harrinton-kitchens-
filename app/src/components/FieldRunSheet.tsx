"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";
import { queuePhoto, flushQueue, pendingPhotoCount } from "@/lib/offline-queue";

type Drawing = { id: string; name: string; url: string };
type FieldJob = {
  id: string; reference: string; title: string;
  clientName: string | null; clientPhone: string | null; clientEmail: string | null;
  address: string | null; mapsUrl: string | null;
  start: string | null; end: string | null; durationDays: number;
  accessNotes: string | null; drawings: Drawing[]; openSnags: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
}

// The installer's day, phone-first (P10.2): today's installs with navigate /
// call / access notes / approved drawings, and photo upload that survives no
// signal (queued in IndexedDB, flushed on reconnect).
export function FieldRunSheet() {
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => setPending(await pendingPhotoCount()), []);
  const load = useCallback(async () => {
    try { const d = await api<{ jobs: FieldJob[] }>("/api/field/today"); setJobs(d.jobs); }
    catch { /* keep whatever we have — offline tolerant */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    refreshPending();
    const onOnline = () => flushQueue().then(refreshPending);
    onOnline();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load, refreshPending]);

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading your day…</div>;

  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="px-4 pt-5 pb-10">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Today on site</h1>
        {pending > 0 && <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{pending} photo{pending === 1 ? "" : "s"} waiting to sync</p>}
      </header>

      {jobs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-stone-500 dark:text-slate-400">No installs booked for today. Enjoy the quiet. 🛠️</div>
      ) : (
        <div className="space-y-4">
          {jobs.map((j) => <FieldCard key={j.id} job={j} onPhotoQueued={refreshPending} />)}
        </div>
      )}
    </div>
  );
}

function FieldCard({ job, onPhotoQueued }: { job: FieldJob; onPhotoQueued: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const snagPhotoRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snagOpen, setSnagOpen] = useState(false);
  const [snagNote, setSnagNote] = useState("");
  const [snagPhoto, setSnagPhoto] = useState<File | null>(null);
  const [openSnags, setOpenSnags] = useState(job.openSnags);

  async function raiseSnag() {
    if (!snagNote.trim()) return;
    setBusy(true);
    try {
      const fileData = snagPhoto ? await fileToBase64(snagPhoto) : undefined;
      await fetch(`/api/jobs/${job.id}/snags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: snagNote, fileData, mimeType: snagPhoto?.type }),
      });
      setOpenSnags((n) => n + 1);
      setSnagNote(""); setSnagPhoto(null); setSnagOpen(false);
      setMsg("Snag raised");
    } catch {
      setMsg("Couldn't raise the snag — try again on signal");
    } finally { setBusy(false); }
  }

  async function addPhotos(files: FileList | null) {
    const picked = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!picked.length) return;
    setBusy(true);
    let sent = 0, queued = 0;
    for (const f of picked) {
      try {
        const form = new FormData();
        form.append("files", f);
        const res = await fetch(`/api/jobs/${job.id}/photos`, { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok !== false) sent++;
        else if (await queuePhoto(job.id, f)) queued++;
      } catch {
        if (await queuePhoto(job.id, f)) queued++;
      }
    }
    setBusy(false);
    setMsg([sent ? `${sent} uploaded` : "", queued ? `${queued} saved offline` : ""].filter(Boolean).join(" · ") || "No photos added");
    onPhotoQueued();
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-stone-100 p-4 dark:border-night-line">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-stone-900 dark:text-slate-100">{job.title}</p>
            <p className="truncate text-sm text-stone-500 dark:text-slate-400">{job.clientName || job.reference}</p>
          </div>
          <div className="shrink-0 text-right text-sm">
            <p className="font-semibold text-stone-700 dark:text-slate-200">{fmtTime(job.start)}</p>
            {job.durationDays > 1 && <p className="text-[11px] text-stone-400 dark:text-slate-500">day of {job.durationDays}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-stone-100 dark:bg-night-line">
        <a
          href={job.mapsUrl || "#"}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center justify-center gap-2 bg-white py-3 text-sm font-semibold dark:bg-night-900 ${job.mapsUrl ? "text-brand-700 dark:text-brand-300" : "pointer-events-none text-stone-300"}`}
        >
          🧭 Navigate
        </a>
        <a
          href={job.clientPhone ? `tel:${job.clientPhone}` : "#"}
          className={`flex items-center justify-center gap-2 bg-white py-3 text-sm font-semibold dark:bg-night-900 ${job.clientPhone ? "text-brand-700 dark:text-brand-300" : "pointer-events-none text-stone-300"}`}
        >
          📞 Call
        </a>
      </div>

      <div className="space-y-3 p-4">
        {job.address && <p className="text-sm text-stone-600 dark:text-slate-300">📍 {job.address}</p>}
        {job.accessNotes && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">🔑 {job.accessNotes}</p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Approved drawings</p>
          {job.drawings.length === 0 ? (
            <p className="text-sm text-stone-400 dark:text-slate-500">No released drawings yet.</p>
          ) : (
            <div className="space-y-1">
              {job.drawings.map((d) => (
                <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                  <span className="truncate">📐 {d.name}</span>
                  <span className="shrink-0 text-brand-600">Open</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-xl bg-brand-600 py-3 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-50"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "…" : "📷 Photos"}
          </button>
          <button
            className="rounded-xl bg-stone-100 py-3 text-sm font-bold text-stone-700 active:scale-[0.99] disabled:opacity-50 dark:bg-night-800 dark:text-slate-200"
            disabled={busy}
            onClick={() => setSnagOpen((v) => !v)}
          >
            ⚠ Snag{openSnags > 0 ? ` (${openSnags})` : ""}
          </button>
        </div>

        {snagOpen && (
          <div className="space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-night-800">
            <input className="input" value={snagNote} onChange={(e) => setSnagNote(e.target.value)} placeholder="What needs fixing?" />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => snagPhotoRef.current?.click()}>{snagPhoto ? "1 photo" : "📷 Add photo"}</button>
              <button className="btn-accent flex-1" disabled={busy || !snagNote.trim()} onClick={raiseSnag}>{busy ? "…" : "Raise"}</button>
            </div>
            <input ref={snagPhotoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setSnagPhoto(e.target.files?.[0] ?? null)} />
          </div>
        )}

        {msg && <p className="text-center text-xs text-stone-500 dark:text-slate-400">{msg}</p>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
      </div>
    </div>
  );
}

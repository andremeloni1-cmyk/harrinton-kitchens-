"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";
import { REVISION_STATUS_LABELS, isRevisionLocked, type RevisionStatus } from "@/lib/drawings";

type Doc = { id: string; name: string; mimeType: string; webViewLink: string | null };
type Comment = { id: string; authorType: string; authorName: string; body: string; createdAt: string };
type Revision = {
  id: string; label: string; status: string; summary: string | null; summaryClient: string | null;
  notes: string | null; sentAt: string | null; approvedAt: string | null; releasedAt: string | null;
  createdAt: string; documents: Doc[]; comments: Comment[];
};
type DrawingSet = { id: string; name: string; createdAt: string; revisions: Revision[] };

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300",
  sent: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  released: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DrawingSets({ jobId }: { jobId: string }) {
  const [sets, setSets] = useState<DrawingSet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [adding, setAdding] = useState(false);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const { sets } = await api<{ sets: DrawingSet[] }>(`/api/jobs/${jobId}/drawings`);
      setSets(sets);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function createSet() {
    setBusy("set");
    try {
      await api(`/api/jobs/${jobId}/drawings`, { method: "POST", body: JSON.stringify({ name: newSetName.trim() || "Drawings" }) });
      setNewSetName("");
      setAdding(false);
      await load();
    } finally { setBusy(null); }
  }
  async function addRevision(setId: string) {
    setBusy(`rev-${setId}`);
    try {
      const res = await api<{ variationRaised?: boolean }>(`/api/jobs/${jobId}/drawings/${setId}/revisions`, { method: "POST", body: JSON.stringify({}) });
      if (res.variationRaised) alert("This is a post-approval change — a variation has been drafted below. Price it and send it for approval.");
      await load();
    } finally { setBusy(null); }
  }
  async function setStatus(rev: Revision, status: RevisionStatus) {
    setBusy(`st-${rev.id}`);
    try {
      await api(`/api/jobs/${jobId}/drawings/revisions/${rev.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't update the revision.");
    } finally { setBusy(null); }
  }
  async function uploadFiles(revId: string, files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(`up-${revId}`);
    try {
      for (const f of Array.from(files)) {
        const fileData = await fileToBase64(f);
        await api(`/api/jobs/${jobId}/drawings/revisions/${revId}/files`, {
          method: "POST",
          body: JSON.stringify({ name: f.name, fileData, mimeType: f.type || "application/pdf" }),
        });
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't upload.");
    } finally { setBusy(null); }
  }
  async function removeFile(revId: string, docId: string) {
    setBusy(`rm-${docId}`);
    try {
      await api(`/api/jobs/${jobId}/drawings/revisions/${revId}/files?docId=${docId}`, { method: "DELETE" });
      await load();
    } finally { setBusy(null); }
  }
  async function reply(revId: string) {
    const text = (replies[revId] || "").trim();
    if (!text) return;
    setBusy(`re-${revId}`);
    try {
      await api(`/api/jobs/${jobId}/drawings/revisions/${revId}/comment`, { method: "POST", body: JSON.stringify({ body: text }) });
      setReplies((r) => ({ ...r, [revId]: "" }));
      await load();
    } finally { setBusy(null); }
  }
  async function summarize(revId: string) {
    setBusy(`sum-${revId}`);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/api/jobs/${jobId}/drawings/revisions/${revId}/summarize`, { method: "POST" });
      if (!res.ok && res.message) alert(res.message);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't summarise.");
    } finally { setBusy(null); }
  }

  if (!loaded) return null;

  return (
    <div className="card mb-3 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Drawings</h2>
        {!adding && (
          <button className="text-sm font-semibold text-brand-600" onClick={() => setAdding(true)}>New set</button>
        )}
      </div>

      {adding && (
        <div className="mb-3 flex gap-2">
          <input className="input flex-1" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="e.g. Kitchen plans" />
          <button className="btn-accent" disabled={busy === "set"} onClick={createSet}>{busy === "set" ? "…" : "Add"}</button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {sets.length === 0 && !adding && <p className="text-sm text-stone-500 dark:text-slate-400">No drawings yet.</p>}

      <div className="space-y-4">
        {sets.map((set) => (
          <div key={set.id}>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{set.name}</p>
              <button className="text-xs font-semibold text-brand-600" disabled={busy === `rev-${set.id}`} onClick={() => addRevision(set.id)}>
                {busy === `rev-${set.id}` ? "…" : "+ Revision"}
              </button>
            </div>
            <div className="space-y-2">
              {set.revisions.map((rev) => {
                const locked = isRevisionLocked(rev.status);
                return (
                  <div key={rev.id} className="rounded-xl border border-stone-100 p-3 dark:border-night-line">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-900 dark:text-slate-100">{rev.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[rev.status] || STATUS_STYLE.draft}`}>
                        {REVISION_STATUS_LABELS[rev.status as RevisionStatus] || rev.status}
                      </span>
                    </div>

                    {rev.summary && (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-stone-50 px-2.5 py-2 text-xs text-stone-600 dark:bg-night-800 dark:text-slate-300">{rev.summary}</p>
                    )}

                    {rev.documents.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {rev.documents.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                            <a href={d.webViewLink || `/api/jobs/${jobId}/documents?docId=${d.id}`} target="_blank" rel="noreferrer" className="truncate text-brand-600 hover:underline">
                              📄 {d.name}
                            </a>
                            {!locked && (
                              <button className="text-xs text-stone-400 hover:text-red-600" disabled={busy === `rm-${d.id}`} onClick={() => removeFile(rev.id, d.id)}>✕</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {rev.comments.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {rev.comments.map((c) => (
                          <div key={c.id} className={`rounded-lg px-2.5 py-1.5 text-sm ${c.authorType === "client" ? "bg-amber-50 dark:bg-amber-500/10" : "bg-stone-100 dark:bg-night-800"}`}>
                            <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">{c.authorName}{c.authorType === "client" ? " (client)" : ""}: </span>
                            <span className="text-stone-700 dark:text-slate-200">{c.body}</span>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input
                            className="input flex-1 py-1.5 text-sm"
                            value={replies[rev.id] || ""}
                            onChange={(e) => setReplies((r) => ({ ...r, [rev.id]: e.target.value }))}
                            placeholder="Reply to the client…"
                          />
                          <button className="btn-secondary py-1.5 text-sm" disabled={busy === `re-${rev.id}` || !(replies[rev.id] || "").trim()} onClick={() => reply(rev.id)}>
                            {busy === `re-${rev.id}` ? "…" : "Reply"}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!locked && (
                        <label className="cursor-pointer text-sm font-medium text-brand-600">
                          {busy === `up-${rev.id}` ? "Uploading…" : "+ Add file"}
                          <input type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => uploadFiles(rev.id, e.target.files)} />
                        </label>
                      )}
                      {rev.status === "draft" && rev.documents.length > 0 && (
                        <button className="btn-secondary py-1.5 text-sm" disabled={busy === `st-${rev.id}`} onClick={() => setStatus(rev, "sent")}>Send for review</button>
                      )}
                      {rev.status === "sent" && (
                        <>
                          <button className="btn-secondary py-1.5 text-sm" disabled={busy === `st-${rev.id}`} onClick={() => setStatus(rev, "approved")}>Mark approved</button>
                          <button className="btn-ghost py-1.5 text-sm" disabled={busy === `st-${rev.id}`} onClick={() => setStatus(rev, "draft")}>Back to draft</button>
                        </>
                      )}
                      {rev.status === "approved" && (
                        <button className="btn-primary py-1.5 text-sm" disabled={busy === `st-${rev.id}`} onClick={() => setStatus(rev, "released")}>Release to factory</button>
                      )}
                      {rev.documents.length > 0 && (
                        <button className="btn-ghost py-1.5 text-sm text-brand-600" disabled={busy === `sum-${rev.id}`} onClick={() => summarize(rev.id)}>
                          {busy === `sum-${rev.id}` ? "Reading…" : rev.summary ? "↻ Re-summarise" : "✨ Summarise changes"}
                        </button>
                      )}
                    </div>
                    {locked && <p className="mt-2 text-xs text-stone-400 dark:text-slate-500">Locked — create a new revision to make changes.</p>}
                  </div>
                );
              })}
              {set.revisions.length === 0 && <p className="text-xs text-stone-400 dark:text-slate-500">No revisions yet — add one to upload drawings.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

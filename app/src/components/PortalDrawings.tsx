"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

type Comment = { authorType: string; authorName: string; body: string; createdAt: string };
type Doc = { id: string; name: string; mimeType: string };
type Rev = {
  id: string; label: string; status: string; summaryClient: string | null; setName: string;
  job: { id: string; title: string; reference: string }; documents: Doc[]; comments: Comment[];
};

export function PortalDrawings() {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const { revisions } = await api<{ revisions: Rev[] }>("/api/portal/drawings");
      setRevs(revisions);
    } catch {
      /* stay quiet */
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { load(); }, []);

  if (!loaded || revs.length === 0) return null;

  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your drawings</p>
      <div className="space-y-3">
        {revs.map((r) => (<RevCard key={r.id} rev={r} onChanged={load} />))}
      </div>
    </section>
  );
}

function RevCard({ rev, onChanged }: { rev: Rev; onChanged: () => void }) {
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [approving, setApproving] = useState(false);
  const [busy, setBusy] = useState<null | "comment" | "approve">(null);
  const [error, setError] = useState<string | null>(null);

  async function sendComment() {
    if (!comment.trim()) return;
    setBusy("comment"); setError(null);
    try {
      await api(`/api/portal/drawings/${rev.id}/comment`, { method: "POST", body: JSON.stringify({ body: comment }) });
      setComment("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your comment.");
    } finally { setBusy(null); }
  }
  async function approve() {
    setBusy("approve"); setError(null);
    try {
      await api(`/api/portal/drawings/${rev.id}/approve`, { method: "POST", body: JSON.stringify({ signerName: name }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't approve.");
    } finally { setBusy(null); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-night-line">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{rev.job.title}</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">{rev.setName} · {rev.label}</p>
        </div>
        {rev.status === "approved" && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Approved</span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {rev.summaryClient && (
          <p className="whitespace-pre-wrap rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
            {rev.summaryClient}
          </p>
        )}

        {rev.documents.length > 0 && (
          <ul className="space-y-1">
            {rev.documents.map((d) => (
              <li key={d.id}>
                <a href={`/api/portal/drawings/file?docId=${d.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                  📄 {d.name}
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* Comment thread */}
        {rev.comments.length > 0 && (
          <div className="space-y-2">
            {rev.comments.map((c, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm ${c.authorType === "client" ? "bg-stone-100 dark:bg-night-800" : "bg-brand-50 dark:bg-brand-500/10"}`}>
                <p className="text-xs font-semibold text-stone-500 dark:text-slate-400">{c.authorName}</p>
                <p className="text-stone-700 dark:text-slate-200">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {rev.status === "sent" && (
          <>
            <div className="flex gap-2">
              <input className="input flex-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ask a question or request a change" />
              <button className="btn-secondary" disabled={busy === "comment" || !comment.trim()} onClick={sendComment}>{busy === "comment" ? "…" : "Send"}</button>
            </div>

            {approving ? (
              <div className="space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-night-800">
                <p className="text-sm text-stone-600 dark:text-slate-300">Type your full name to approve these drawings.</p>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" />
                <div className="flex gap-2">
                  <button className="btn-accent flex-1" disabled={busy === "approve" || name.trim().length < 2} onClick={approve}>
                    {busy === "approve" ? "Approving…" : "Approve drawings"}
                  </button>
                  <button className="btn-ghost" onClick={() => setApproving(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn-accent w-full" onClick={() => { setError(null); setApproving(true); }}>Approve these drawings</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

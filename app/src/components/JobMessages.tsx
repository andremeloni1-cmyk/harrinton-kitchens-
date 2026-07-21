"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";

type Msg = { id: string; sender: string; authorName: string | null; body: string; createdAt: string };

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Office side of the client ↔ office thread (P11.3). AI can draft a reply into
// the box, but the office edits and sends — nothing auto-sends.
export function JobMessages({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasClient, setHasClient] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "send" | "suggest">(null);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ hasClient: boolean; messages: Msg[] }>(`/api/jobs/${jobId}/messages`);
      setMessages(d.messages); setHasClient(d.hasClient);
    } catch { /* ignore */ }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  async function send() {
    if (!draft.trim()) return;
    setBusy("send"); setNote(null);
    try {
      await api(`/api/jobs/${jobId}/messages`, { method: "POST", body: JSON.stringify({ body: draft.trim() }) });
      setDraft("");
      await load();
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn't send."); }
    finally { setBusy(null); }
  }
  async function suggest() {
    setBusy("suggest"); setNote(null);
    try {
      const d = await api<{ draft: string | null; unavailable: boolean }>(`/api/jobs/${jobId}/messages/suggest`, { method: "POST" });
      if (d.draft) setDraft(d.draft);
      else setNote("AI suggestions aren’t available right now — write your reply below.");
    } catch { setNote("Couldn’t draft a reply."); }
    finally { setBusy(null); }
  }

  return (
    <div className="card mb-3 p-4">
      <h2 className="mb-2 font-semibold text-stone-900 dark:text-slate-100">Messages</h2>
      {!hasClient ? (
        <p className="text-sm text-stone-500 dark:text-slate-400">Link a client to this job to start a conversation.</p>
      ) : (
        <>
          <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-stone-400 dark:text-slate-500">No messages yet.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "office" ? "ml-auto bg-brand-600 text-white" : "bg-stone-100 text-stone-800 dark:bg-night-800 dark:text-slate-100"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${m.sender === "office" ? "text-white/70" : "text-stone-400 dark:text-slate-500"}`}>{m.authorName || (m.sender === "office" ? "Office" : "Client")} · {fmt(m.createdAt)}</p>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <textarea className="input min-h-[70px] resize-y" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply to the client…" />
          {note && <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">{note}</p>}
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" disabled={busy !== null || !draft.trim()} onClick={send}>{busy === "send" ? "Sending…" : "Send"}</button>
            <button className="btn-secondary" disabled={busy !== null} onClick={suggest}>{busy === "suggest" ? "Drafting…" : "✨ Suggest reply"}</button>
          </div>
        </>
      )}
    </div>
  );
}

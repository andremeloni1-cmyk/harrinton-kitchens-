"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";

type Msg = { id: string; sender: string; authorName: string | null; body: string; createdAt: string };

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Client side of the job thread (P11.3): read office replies and send a message.
export function PortalMessages({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api<{ messages: Msg[] }>(`/api/portal/messages?jobId=${jobId}`); setMessages(d.messages); }
    catch { /* ignore */ }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api(`/api/portal/messages`, { method: "POST", body: JSON.stringify({ jobId, body: draft.trim() }) });
      setDraft("");
      await load();
    } finally { setBusy(false); }
  }

  const showForm = open || messages.length > 0;

  return (
    <div className="border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Messages</p>
        {!showForm && <button className="text-sm font-semibold text-brand-600" onClick={() => setOpen(true)}>Ask a question</button>}
      </div>

      {messages.length > 0 && (
        <div className="mb-2 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "client" ? "ml-auto bg-brand-600 text-white" : "bg-stone-100 text-stone-800 dark:bg-night-800 dark:text-slate-100"}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-0.5 text-[10px] ${m.sender === "client" ? "text-white/70" : "text-stone-400 dark:text-slate-500"}`}>{m.sender === "client" ? "You" : m.authorName || "Our team"} · {fmt(m.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="space-y-2">
          <textarea className="input min-h-[60px] resize-y" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message our team…" />
          <button className="btn-accent w-full" disabled={busy || !draft.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</button>
        </div>
      )}
    </div>
  );
}

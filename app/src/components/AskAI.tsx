"use client";

import { useState } from "react";
import { api } from "@/lib/job";

const EXAMPLES = ["What's blocking the Nguyen job?", "Can we fit a 12-cabinet job before Christmas?", "What's at schedule risk?"];

// Ask-AI box (P12.2): questions answered from the deterministic business
// snapshot. When AI isn't configured it says so — it never makes numbers up.
export function AskAI() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setBusy(true); setAnswer(null); setUnavailable(false);
    try {
      const d = await api<{ answer: string | null; unavailable: boolean }>("/api/ask", { method: "POST", body: JSON.stringify({ question: text }) });
      setAnswer(d.answer);
      setUnavailable(d.unavailable);
    } catch {
      setUnavailable(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="card mb-4 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Ask AI</p>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
          placeholder="Ask about jobs, capacity, money…"
        />
        <button className="btn-primary" disabled={busy || !q.trim()} onClick={() => ask(q)}>{busy ? "…" : "Ask"}</button>
      </div>

      {answer && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-800 dark:bg-night-800 dark:text-slate-100">{answer}</p>}
      {unavailable && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          The AI assistant isn&apos;t configured yet. Once connected it answers from live data — no guessing.
        </p>
      )}

      {!answer && !busy && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setQ(ex); ask(ex); }} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-200 dark:bg-night-800 dark:text-slate-400">
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

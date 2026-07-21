"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { fmtMoney } from "@/lib/format";
import { centsToDollars } from "@/lib/quote";

type PortalQuote = {
  id: string;
  version: number;
  status: string;
  currency: string;
  totalCents: number;
  acceptedAt: string | null;
  job: { id: string; reference: string; title: string };
  invoice: { number: string; total: number; currency: string } | null;
};

function openPdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  // Try a new tab; fall back to a download if the browser blocks it.
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PortalQuotes() {
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const { quotes } = await api<{ quotes: PortalQuote[] }>("/api/portal/quotes");
      setQuotes(quotes);
    } catch {
      /* portal may be mid-auth; stay quiet */
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (!loaded || quotes.length === 0) return null;

  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your quotes</p>
      <div className="space-y-3">
        {quotes.map((q) => (
          <QuoteCard key={q.id} quote={q} onChanged={load} />
        ))}
      </div>
    </section>
  );
}

function QuoteCard({ quote, onChanged }: { quote: PortalQuote; onChanged: () => void }) {
  const [mode, setMode] = useState<null | "accept" | "changes">(null);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<null | "pdf" | "accept" | "changes">(null);
  const [error, setError] = useState<string | null>(null);
  const total = fmtMoney(centsToDollars(quote.totalCents), quote.currency);

  async function viewPdf() {
    setBusy("pdf");
    setError(null);
    try {
      const res = await api<{ pdfBase64?: string; filename?: string; error?: string }>(
        `/api/portal/quotes/${quote.id}/pdf`,
        { method: "POST" }
      );
      if (res.pdfBase64 && res.filename) openPdf(res.pdfBase64, res.filename);
      else setError(res.error || "Couldn't open the PDF.");
    } catch {
      setError("Couldn't open the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      await api(`/api/portal/quotes/${quote.id}/accept`, { method: "POST", body: JSON.stringify({ signerName: name }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't accept the quote.");
    } finally {
      setBusy(null);
    }
  }

  async function requestChanges() {
    setBusy("changes");
    setError(null);
    try {
      await api(`/api/portal/quotes/${quote.id}/request-changes`, { method: "POST", body: JSON.stringify({ comment }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-night-line">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{quote.job.title}</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">Quote v{quote.version} · {quote.job.reference}</p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums text-stone-900 dark:text-slate-100">{total}</p>
      </div>

      <div className="px-4 py-3">
        <button className="btn-secondary w-full" disabled={busy === "pdf"} onClick={viewPdf}>
          {busy === "pdf" ? "Opening…" : "View quote (PDF)"}
        </button>

        {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {quote.status === "accepted" ? (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <p className="font-semibold">✓ Accepted</p>
            {quote.invoice && (
              <p className="mt-0.5">
                Deposit invoice {quote.invoice.number} for {fmtMoney(quote.invoice.total, quote.invoice.currency)} has been raised — we&apos;ll be in touch about payment.
              </p>
            )}
          </div>
        ) : quote.status === "changes_requested" ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Thanks — we&apos;ve got your change request and will send an updated quote soon.
          </p>
        ) : mode === "accept" ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-stone-600 dark:text-slate-300">Type your full name to accept this quote.</p>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" />
            <div className="flex gap-2">
              <button className="btn-accent flex-1" disabled={busy === "accept" || name.trim().length < 2} onClick={accept}>
                {busy === "accept" ? "Accepting…" : "Accept quote"}
              </button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        ) : mode === "changes" ? (
          <div className="mt-3 space-y-2">
            <textarea className="input min-h-[80px] resize-y" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What would you like changed?" />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy === "changes" || !comment.trim()} onClick={requestChanges}>
                {busy === "changes" ? "Sending…" : "Send request"}
              </button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button className="btn-accent flex-1" onClick={() => { setError(null); setMode("accept"); }}>Accept</button>
            <button className="btn-secondary flex-1" onClick={() => { setError(null); setMode("changes"); }}>Request changes</button>
          </div>
        )}
      </div>
    </div>
  );
}

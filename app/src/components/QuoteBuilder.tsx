"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { fmtMoney } from "@/lib/format";
import {
  computeQuoteTotals,
  centsToDollars,
  type QuoteDTO,
  type QuoteSection,
} from "@/lib/quote";

// Download a base64 PDF the browser can save.
function downloadPdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function QuoteBuilder({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<QuoteDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sections, setSections] = useState<QuoteSection[]>([]);
  const [marginPct, setMarginPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "pdf" | "suggest" | "new" | "send">(null);
  const [toast, setToast] = useState<string | null>(null);

  const active = quotes.find((q) => q.id === activeId) || null;

  const loadInto = useCallback((q: QuoteDTO) => {
    setActiveId(q.id);
    setSections(q.sections.length ? q.sections : [{ title: "", lines: [] }]);
    setMarginPct(q.marginPct);
    setNotes(q.notes || "");
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { quotes } = await api<{ quotes: QuoteDTO[] }>(`/api/jobs/${jobId}/quotes`);
      setQuotes(quotes);
      if (quotes.length) loadInto(quotes[0]);
    } finally {
      setLoading(false);
    }
  }, [jobId, loadInto]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  const totals = computeQuoteTotals(sections, marginPct);

  // ---- mutators (immutable) ----
  const mutate = (fn: (s: QuoteSection[]) => QuoteSection[]) => {
    setSections((prev) => fn(structuredClone(prev)));
    setDirty(true);
  };
  const addSection = () => mutate((s) => [...s, { title: "New section", lines: [] }]);
  const removeSection = (si: number) => mutate((s) => s.filter((_, i) => i !== si));
  const setSectionTitle = (si: number, title: string) => mutate((s) => { s[si].title = title; return s; });
  const addLine = (si: number) => mutate((s) => { s[si].lines.push({ description: "", quantity: 1, unitAmount: 0 }); return s; });
  const removeLine = (si: number, li: number) => mutate((s) => { s[si].lines.splice(li, 1); return s; });
  const setLine = (si: number, li: number, patch: Partial<QuoteSection["lines"][number]>) =>
    mutate((s) => { s[si].lines[li] = { ...s[si].lines[li], ...patch }; return s; });

  async function createVersion() {
    setBusy("new");
    try {
      const { quote } = await api<{ quote: QuoteDTO }>(`/api/jobs/${jobId}/quotes`, { method: "POST" });
      await load();
      loadInto(quote);
      flash(`Quote v${quote.version} created`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't create the quote");
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<QuoteDTO | null> {
    if (!active) return null;
    setBusy("save");
    try {
      const { quote } = await api<{ quote: QuoteDTO }>(`/api/jobs/${jobId}/quotes/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sections, marginPct, notes }),
      });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? quote : q)));
      setDirty(false);
      return quote;
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't save");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    if (!active) return;
    setBusy("suggest");
    try {
      const res = await api<{ section: QuoteSection | null; message?: string }>(
        `/api/jobs/${jobId}/quotes/${active.id}/suggest`,
        { method: "POST" }
      );
      if (res.section) {
        mutate((s) => [...s, res.section as QuoteSection]);
        flash(`Added ${res.section.lines.length} suggested line(s)`);
      } else {
        flash(res.message || "No suggestions right now");
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't get suggestions");
    } finally {
      setBusy(null);
    }
  }

  async function sendToClient() {
    if (!active) return;
    setBusy("send");
    try {
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      const res = await api<{ ok: boolean; sent: boolean; hasEmail: boolean }>(
        `/api/jobs/${jobId}/quotes/${active.id}/send`,
        { method: "POST" }
      );
      await load();
      flash(
        !res.hasEmail
          ? "Marked as sent — no client email on file, share the PDF manually."
          : res.sent
            ? "Sent — the client has an email with a link to accept."
            : "Marked as sent (demo — the portal link was logged on the server)."
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't send the quote");
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdfNow() {
    if (!active) return;
    setBusy("pdf");
    try {
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      const res = await api<{ pdfBase64?: string; filename?: string; error?: string }>(
        `/api/jobs/${jobId}/quotes/${active.id}/pdf`,
        { method: "POST" }
      );
      if (!res.pdfBase64 || !res.filename) return flash(res.error || "Couldn't build the PDF");
      downloadPdf(res.pdfBase64, res.filename);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't build the PDF");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;

  return (
    <div className="px-4 pt-5 pb-4">
      {toast && (
        <div className="toast-in fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <Link href={`/jobs/${jobId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back to job
      </Link>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">Quote</h1>
        {quotes.length > 0 && (
          <select
            className="input w-auto py-1.5 text-sm"
            value={activeId || ""}
            onChange={(e) => {
              const q = quotes.find((x) => x.id === e.target.value);
              if (q) loadInto(q);
            }}
          >
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>
                v{q.version} · {q.status}
              </option>
            ))}
          </select>
        )}
      </div>

      {!active ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <p className="font-semibold text-stone-900 dark:text-slate-100">No quote yet</p>
          <p className="max-w-xs text-sm text-stone-500 dark:text-slate-400">
            Start a quote — we’ll seed it from this job’s estimate if you’ve built one.
          </p>
          <button className="btn-accent" disabled={busy === "new"} onClick={createVersion}>
            {busy === "new" ? "Creating…" : "Create quote"}
          </button>
        </div>
      ) : (
        <>
          {/* Sections */}
          <div className="space-y-4">
            {sections.map((section, si) => (
              <div key={si} className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    className="input flex-1 font-semibold"
                    value={section.title}
                    placeholder="Section name"
                    onChange={(e) => setSectionTitle(si, e.target.value)}
                  />
                  <button
                    className="btn-ghost px-2 text-stone-400 hover:text-red-600"
                    aria-label="Remove section"
                    onClick={() => removeSection(si)}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2">
                  {section.lines.map((line, li) => {
                    const lineCents = Math.round((line.quantity || 0) * Math.round((line.unitAmount || 0) * 100));
                    return (
                      <div key={li} className="flex flex-wrap items-center gap-2">
                        <input
                          className="input min-w-0 flex-1"
                          value={line.description}
                          placeholder="Description"
                          onChange={(e) => setLine(si, li, { description: e.target.value })}
                        />
                        <input
                          className="input w-16 text-right"
                          type="number"
                          step="0.01"
                          value={line.quantity}
                          aria-label="Quantity"
                          onChange={(e) => setLine(si, li, { quantity: Number(e.target.value) })}
                        />
                        <span className="text-stone-400">×</span>
                        <input
                          className="input w-24 text-right"
                          type="number"
                          step="0.01"
                          value={line.unitAmount}
                          aria-label="Unit price"
                          onChange={(e) => setLine(si, li, { unitAmount: Number(e.target.value) })}
                        />
                        <span className="w-24 text-right text-sm font-medium tabular-nums text-stone-700 dark:text-slate-200">
                          {fmtMoney(centsToDollars(lineCents), active.currency)}
                        </span>
                        <button
                          className="btn-ghost px-2 text-stone-400 hover:text-red-600"
                          aria-label="Remove line"
                          onClick={() => removeLine(si, li)}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button className="btn-ghost mt-2 text-sm text-brand-600" onClick={() => addLine(si)}>
                  + Add line
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={addSection}>+ Section</button>
            <button className="btn-secondary" disabled={busy === "suggest"} onClick={suggest}>
              {busy === "suggest" ? "Thinking…" : "✨ AI suggest lines"}
            </button>
          </div>

          {/* Margin + totals */}
          <div className="card mt-4 p-4">
            <label className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-stone-700 dark:text-slate-200">Margin</span>
              <span className="flex items-center gap-1">
                <input
                  className="input w-20 text-right"
                  type="number"
                  step="0.5"
                  value={marginPct}
                  onChange={(e) => { setMarginPct(Number(e.target.value) || 0); setDirty(true); }}
                />
                <span className="text-stone-400">%</span>
              </span>
            </label>
            <Totals label="Line items" value={fmtMoney(centsToDollars(totals.linesCents), active.currency)} />
            {totals.marginCents !== 0 && (
              <Totals label={`Margin (${marginPct}%)`} value={fmtMoney(centsToDollars(totals.marginCents), active.currency)} />
            )}
            <Totals label="Subtotal (ex GST)" value={fmtMoney(centsToDollars(totals.subtotalCents), active.currency)} />
            <Totals label="GST (10%)" value={fmtMoney(centsToDollars(totals.taxCents), active.currency)} />
            <div className="mt-1 border-t border-stone-100 pt-2 dark:border-night-line">
              <Totals label="Total" value={fmtMoney(centsToDollars(totals.totalCents), active.currency)} strong />
            </div>
          </div>

          {/* Notes */}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-slate-200">Notes on the quote</span>
            <textarea
              className="input min-h-[80px] resize-y"
              value={notes}
              placeholder="Optional — validity, inclusions, payment terms…"
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            />
          </label>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!dirty || busy === "save"} onClick={save}>
              {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
            <button className="btn-accent" disabled={busy === "pdf"} onClick={downloadPdfNow}>
              {busy === "pdf" ? "Building…" : "Download PDF"}
            </button>
            <button className="btn-secondary" disabled={busy === "send"} onClick={sendToClient}>
              {busy === "send" ? "Sending…" : active.status === "draft" ? "Send to client" : "Resend"}
            </button>
            <button className="btn-secondary" disabled={busy === "new"} onClick={createVersion}>
              {busy === "new" ? "…" : "New version"}
            </button>
          </div>
          {active.status !== "draft" && (
            <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
              This quote is <span className="font-semibold">{active.status.replace("_", " ")}</span>
              {active.acceptedAt ? ` — accepted ${new Date(active.acceptedAt).toLocaleDateString("en-GB")}` : ""}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Totals({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={strong ? "font-bold text-stone-900 dark:text-slate-100" : "text-sm text-stone-500 dark:text-slate-400"}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-lg font-bold text-stone-900 dark:text-slate-100" : "text-sm font-medium text-stone-700 dark:text-slate-200"}`}>{value}</span>
    </div>
  );
}

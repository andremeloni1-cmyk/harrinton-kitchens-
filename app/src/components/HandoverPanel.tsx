"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { api } from "@/lib/job";

// Download a base64 PDF.
function downloadPdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Result = { pdfBase64: string | null; filename: string; invoiceNumber: string | null; balance: number };

// On-site handover ceremony (P10.4): client signs, we generate the pack, move to
// HANDOVER, and draft the final balance invoice.
export function HandoverPanel({ jobId, clientName }: { jobId: string; clientName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [signer, setSigner] = useState(clientName || "");
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  async function complete() {
    if (signer.trim().length < 2) { setError("Type the client's name."); return; }
    setBusy(true); setError(null);
    try {
      const res = await api<{ ok?: boolean; pdfBase64: string | null; filename: string; invoiceNumber: string | null; balance: number; error?: string }>(
        `/api/jobs/${jobId}/handover`,
        { method: "POST", body: JSON.stringify({ signerName: signer.trim(), signatureData: sig }) }
      );
      setDone({ pdfBase64: res.pdfBase64, filename: res.filename, invoiceNumber: res.invoiceNumber, balance: res.balance });
      if (res.pdfBase64) downloadPdf(res.pdfBase64, res.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete the handover.");
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="card mb-3 border-l-4 border-emerald-400 p-4 dark:border-emerald-500/50">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Handover complete ✓</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          Pack shared to the portal{done.invoiceNumber ? ` · final invoice ${done.invoiceNumber} drafted for $${done.balance.toFixed(2)}` : ""}.
        </p>
        {done.pdfBase64 && (
          <button className="btn-secondary mt-2" onClick={() => downloadPdf(done.pdfBase64!, done.filename)}>Download pack again</button>
        )}
      </div>
    );
  }

  return (
    <div className="card mb-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Handover</h2>
        {!open && <button className="text-sm font-semibold text-brand-600" onClick={() => setOpen(true)}>Start handover</button>}
      </div>
      {!open ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">Client sign-off generates the handover pack and drafts the final invoice.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-slate-200">Client name (signing)</span>
            <input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Full name" />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-slate-200">Signature</span>
            <SignaturePad onChange={setSig} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-accent flex-1" disabled={busy} onClick={complete}>{busy ? "Completing…" : "Complete handover"}</button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

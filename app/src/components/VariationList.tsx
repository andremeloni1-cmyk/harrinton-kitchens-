"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";
import { fmtMoney } from "@/lib/format";

type Variation = {
  id: string; title: string; description: string | null; amountCents: number; status: string; source: string; createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300",
  sent: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  declined: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

export function VariationList({ jobId }: { jobId: string }) {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const { variations } = await api<{ variations: Variation[] }>(`/api/jobs/${jobId}/variations`);
      setVariations(variations);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const approvedTotal = variations.filter((v) => v.status === "approved").reduce((s, v) => s + v.amountCents, 0);

  async function create() {
    setBusy("new");
    try {
      await api(`/api/jobs/${jobId}/variations`, { method: "POST", body: JSON.stringify({ title: newTitle.trim() || "Variation", amountCents: Math.round((Number(newAmount) || 0) * 100) }) });
      setNewTitle(""); setNewAmount(""); setAdding(false);
      await load();
    } finally { setBusy(null); }
  }
  async function patch(v: Variation, data: Record<string, unknown>) {
    setBusy(v.id);
    try {
      await api(`/api/jobs/${jobId}/variations/${v.id}`, { method: "PATCH", body: JSON.stringify(data) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't update.");
    } finally { setBusy(null); }
  }
  async function remove(v: Variation) {
    setBusy(v.id);
    try {
      await api(`/api/jobs/${jobId}/variations/${v.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't delete.");
    } finally { setBusy(null); }
  }

  if (!loaded) return null;

  return (
    <div className="card mb-3 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Variations</h2>
        {!adding && <button className="text-sm font-semibold text-brand-600" onClick={() => setAdding(true)}>New</button>}
      </div>

      {adding && (
        <div className="mb-3 space-y-2">
          <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What's changing?" />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-stone-400">$</span>
              <input className="input pl-7" type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="Amount (ex GST)" />
            </div>
            <button className="btn-accent" disabled={busy === "new"} onClick={create}>{busy === "new" ? "…" : "Add"}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {variations.length === 0 && !adding && <p className="text-sm text-stone-500 dark:text-slate-400">No variations.</p>}

      <div className="space-y-2">
        {variations.map((v) => (
          <div key={v.id} className="rounded-xl border border-stone-100 p-3 dark:border-night-line">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-stone-900 dark:text-slate-100">{v.title}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[v.status] || STATUS_STYLE.draft}`}>{v.status}</span>
            </div>
            {v.description && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-500 dark:text-slate-400">{v.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {v.status === "draft" ? (
                <>
                  <div className="relative w-32">
                    <span className="absolute left-2.5 top-2 text-sm text-stone-400">$</span>
                    <input
                      className="input py-1.5 pl-6 text-sm"
                      type="number"
                      step="0.01"
                      defaultValue={(v.amountCents / 100).toString()}
                      onBlur={(e) => { const c = Math.round((Number(e.target.value) || 0) * 100); if (c !== v.amountCents) patch(v, { amountCents: c }); }}
                    />
                  </div>
                  <button className="btn-secondary py-1.5 text-sm" disabled={busy === v.id || v.amountCents === 0} onClick={() => patch(v, { status: "sent" })}>Send to client</button>
                  <button className="btn-ghost py-1.5 text-sm text-stone-400 hover:text-red-600" disabled={busy === v.id} onClick={() => remove(v)}>Delete</button>
                </>
              ) : (
                <span className="text-sm font-semibold tabular-nums text-stone-700 dark:text-slate-200">{fmtMoney(v.amountCents / 100)} <span className="text-xs font-normal text-stone-400">ex GST</span></span>
              )}
            </div>
          </div>
        ))}
      </div>

      {approvedTotal !== 0 && (
        <p className="mt-3 border-t border-stone-100 pt-2 text-sm dark:border-night-line">
          <span className="text-stone-500 dark:text-slate-400">Approved variations: </span>
          <span className="font-bold tabular-nums text-stone-900 dark:text-slate-100">{fmtMoney(approvedTotal / 100)}</span>
          <span className="text-xs text-stone-400"> added to the contract value</span>
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { fmtMoney } from "@/lib/format";

type Variation = {
  id: string; title: string; description: string | null; amountCents: number; status: string;
  job: { id: string; title: string; reference: string };
};

export function PortalVariations() {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const { variations } = await api<{ variations: Variation[] }>("/api/portal/variations");
      setVariations(variations);
    } catch {
      /* quiet */
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { load(); }, []);

  if (!loaded || variations.length === 0) return null;

  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Variations to approve</p>
      <div className="space-y-3">
        {variations.map((v) => (<VariationCard key={v.id} variation={v} onChanged={load} />))}
      </div>
    </section>
  );
}

function VariationCard({ variation, onChanged }: { variation: Variation; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [approving, setApproving] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  const isCredit = variation.amountCents < 0;

  async function decide(decision: "approved" | "declined") {
    setBusy(decision === "approved" ? "approve" : "decline");
    setError(null);
    try {
      await api(`/api/portal/variations/${variation.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, signerName: name }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record your decision.");
    } finally { setBusy(null); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-night-line">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{variation.title}</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">{variation.job.title}</p>
        </div>
        <p className={`shrink-0 text-lg font-bold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-stone-900 dark:text-slate-100"}`}>
          {isCredit ? "−" : "+"}{fmtMoney(Math.abs(variation.amountCents) / 100)}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {variation.description && <p className="whitespace-pre-wrap text-sm text-stone-600 dark:text-slate-300">{variation.description}</p>}
        <p className="text-xs text-stone-400 dark:text-slate-500">Amount shown is ex GST.</p>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {variation.status === "approved" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">✓ Approved</p>
        ) : variation.status === "declined" ? (
          <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-night-800 dark:text-slate-300">Declined</p>
        ) : approving ? (
          <div className="space-y-2">
            <p className="text-sm text-stone-600 dark:text-slate-300">Type your full name to approve this variation.</p>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" />
            <div className="flex gap-2">
              <button className="btn-accent flex-1" disabled={busy === "approve" || name.trim().length < 2} onClick={() => decide("approved")}>
                {busy === "approve" ? "Approving…" : "Approve variation"}
              </button>
              <button className="btn-ghost" onClick={() => setApproving(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn-accent flex-1" onClick={() => { setError(null); setApproving(true); }}>Approve</button>
            <button className="btn-secondary flex-1" disabled={busy === "decline"} onClick={() => decide("declined")}>{busy === "decline" ? "…" : "Decline"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

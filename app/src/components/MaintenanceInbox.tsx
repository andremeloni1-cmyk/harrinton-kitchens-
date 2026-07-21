"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/job";

type Req = { id: string; clientName: string; clientPhone: string | null; message: string; sourceRef: string | null; createdAt: string };

// Office triage inbox for client-portal maintenance requests (P10.5). Convert
// turns a request into a MAINTENANCE job (client notified). Quiet when empty.
export function MaintenanceInbox() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await api<{ requests: Req[] }>("/api/maintenance-requests"); setReqs(d.requests); }
    catch { /* ignore */ }
    finally { setReady(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "convert" | "dismiss") {
    setBusy(id);
    try { await api(`/api/maintenance-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); await load(); }
    finally { setBusy(null); }
  }

  if (!ready || reqs.length === 0) return null;

  return (
    <div className="card mb-4 border-l-4 border-sky-400 p-4 dark:border-sky-500/50">
      <p className="mb-2 text-sm font-semibold text-sky-700 dark:text-sky-300">🔧 {reqs.length} maintenance request{reqs.length === 1 ? "" : "s"}</p>
      <div className="space-y-2">
        {reqs.map((r) => (
          <div key={r.id} className="rounded-xl bg-stone-50 p-3 dark:bg-night-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-800 dark:text-slate-100">{r.clientName}{r.clientPhone ? <span className="font-normal text-stone-400"> · {r.clientPhone}</span> : null}</p>
                {r.sourceRef && <p className="text-xs text-stone-400 dark:text-slate-500">Re: {r.sourceRef}</p>}
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">{r.message}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={busy === r.id} onClick={() => act(r.id, "convert")}>
                {busy === r.id ? "…" : "Convert to job"}
              </button>
              <button className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-500 disabled:opacity-50 dark:bg-night-900 dark:text-slate-400" disabled={busy === r.id} onClick={() => act(r.id, "dismiss")}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { api } from "@/lib/job";

type PortalPlan = {
  id: string;
  name: string;
  reviewStatus?: string | null;
  reviewedAt?: string | null;
};

/** Client-portal side of plan review: view the plan, approve it, or request
 * changes. Responses land on the office dashboard immediately. */
export function PortalPlanReview({ clientId, plan }: { clientId: string; plan: PortalPlan }) {
  const [status, setStatus] = useState(plan.reviewStatus || "pending");
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "changes") {
    setBusy(action);
    setError(null);
    try {
      await api("/api/portal/plans", {
        method: "POST",
        body: JSON.stringify({ clientId, documentId: plan.id, action, note: note.trim() }),
      });
      setStatus(action === "approve" ? "approved" : "changes_requested");
      setChanging(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please call the office.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-stone-50 px-3.5 py-3 dark:bg-night-850">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-slate-100">📐 {plan.name}</span>
        <a
          href={`/api/portal/documents/${plan.id}?client=${clientId}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-stone-200 dark:bg-night-900 dark:text-brand-300 dark:ring-night-line"
        >
          View plan
        </a>
      </div>

      {status === "approved" ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          ✅ You&apos;ve approved this plan — thank you! We&apos;ll build to this revision.
        </p>
      ) : status === "changes_requested" ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          ✏️ Change request received — we&apos;ll come back to you with a revised plan.
        </p>
      ) : changing ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Could we swap the pantry and fridge positions, and make the island 200mm longer?"
          />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 py-2" onClick={() => setChanging(false)} disabled={!!busy}>
              Back
            </button>
            <button className="btn-primary flex-1 py-2" onClick={() => act("changes")} disabled={!!busy || !note.trim()}>
              {busy === "changes" ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="mb-2 text-xs text-stone-500 dark:text-slate-400">
            Please review before your install date — approving locks in this revision.
          </p>
          {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1 py-2" onClick={() => act("approve")} disabled={!!busy}>
              {busy === "approve" ? "Saving…" : "Approve plan"}
            </button>
            <button className="btn-secondary flex-1 py-2" onClick={() => setChanging(true)} disabled={!!busy}>
              Request changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

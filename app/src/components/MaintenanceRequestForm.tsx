"use client";

import { useState } from "react";
import { api } from "@/lib/job";

/** Client-portal form: a homeowner asks for a maintenance / warranty visit.
 * Lands in the dashboard as a job to confirm ("lead"), like an email lead. */
export function MaintenanceRequestForm({
  clientId,
  jobs,
}: {
  clientId: string;
  jobs: { id: string; title: string }[];
}) {
  const [jobId, setJobId] = useState(jobs[0]?.id || "");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return setError("Please tell us what needs attention.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/portal/requests", {
        method: "POST",
        body: JSON.stringify({ clientId, jobId: jobId || null, message: message.trim(), phone: phone.trim() || null }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please call the office.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
        ✅ Request received — we&apos;ll be in touch within one business day to book your visit.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {jobs.length > 1 && (
        <div>
          <label className="label">Which project?</label>
          <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">What needs attention?</label>
        <textarea
          className="input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. The pantry door has dropped slightly and catches when closing"
        />
      </div>
      <div>
        <label className="label">Best phone number (optional)</label>
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Request maintenance visit"}
      </button>
    </form>
  );
}

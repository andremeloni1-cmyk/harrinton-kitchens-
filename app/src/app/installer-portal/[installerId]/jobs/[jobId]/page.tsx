"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { Checklist } from "@/components/Checklist";
import { ReportEditor } from "@/components/ReportEditor";
import { fmtDay, fmtRange, fmtTime } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { queueMutation } from "@/lib/offline-queue";
import type { ChecklistItem } from "@/lib/pdf";

// Persist a background PATCH; if it fails (offline in a garage), queue it to
// replay when the connection returns — same behaviour as the admin job page.
function savePatch(url: string, body: unknown) {
  api(url, { method: "PATCH", body: JSON.stringify(body) }).catch(() => {
    queueMutation(url, "PATCH", body).then(() => window.dispatchEvent(new CustomEvent("jf-offline-queued")));
  });
}

function parseChecklist(raw?: string): ChecklistItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((i) => i && typeof i.label === "string");
  } catch {
    /* ignore */
  }
  return [];
}

export default function InstallerJobPage() {
  const { installerId, jobId } = useParams<{ installerId: string; jobId: string }>();
  const [job, setJob] = useState<JobDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [todos, setTodos] = useState<ChecklistItem[]>([]);
  const [maintenance, setMaintenance] = useState<ChecklistItem[]>([]);
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { job } = await api<{ job: JobDTO }>(`/api/jobs/${jobId}`);
      setJob(job);
      setTodos(parseChecklist(job.todos));
      setMaintenance(parseChecklist(job.maintenanceTasks));
    } finally {
      setLoading(false);
    }
  }, [jobId]);
  useEffect(() => {
    load();
    // Reload once the offline queue replays so a fix logged in a no-signal
    // garage shows up here instead of leaving the page stale (P3-7).
    const onSynced = () => load();
    window.addEventListener("jf-offline-synced", onSynced);
    return () => window.removeEventListener("jf-offline-synced", onSynced);
  }, [load]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  function saveTodos(items: ChecklistItem[]) {
    setTodos(items);
    savePatch(`/api/jobs/${jobId}/todos`, { items });
  }
  function saveMaintenance(items: ChecklistItem[]) {
    setMaintenance(items);
    savePatch(`/api/jobs/${jobId}/maintenance`, { items });
  }

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api(`/api/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      flash(status === "completed" ? "Nice one — job marked complete. The office has been notified." : "Job started — good luck out there.");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't update the job just now.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-lg text-stone-400 dark:text-slate-500">Loading…</div>;
  if (!job || (job.installerId && job.installerId !== installerId)) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">
          This job isn&apos;t on your run sheet.{" "}
          <Link href={`/installer-portal/${installerId}`} className="text-brand-600 underline">Back</Link>
        </p>
      </div>
    );
  }

  const latestReport = job.reports?.[0] || null;

  return (
    <div className="mx-auto max-w-lg">
      {toast && (
        <div className="toast-in fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <Link
        href={`/installer-portal/${installerId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Run sheet
      </Link>

      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">{job.title}</h1>
          <StatusPill status={job.status} />
        </div>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{job.reference}</p>
      </div>

      {/* On-site actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["accepted", "scheduled"].includes(job.status) && (
          <button className="btn-primary" disabled={busy} onClick={() => changeStatus("in_progress")}>
            Start work
          </button>
        )}
        {job.status === "in_progress" && (
          <button className="btn-primary" disabled={busy} onClick={() => changeStatus("completed")}>
            Mark complete
          </button>
        )}
      </div>

      {/* Where & when */}
      <div className="card mb-3 space-y-2.5 p-4 text-sm">
        <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
          <span>📅</span>
          {job.scheduledStart ? (
            <span>
              <b>{fmtDay(job.scheduledStart)}</b> · {fmtRange(job.scheduledStart, job.scheduledEnd)}
            </span>
          ) : (
            <span className="text-stone-400 dark:text-slate-500">Not scheduled yet</span>
          )}
        </p>
        {job.address && (
          <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
            <span>📍</span>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600"
            >
              {job.address} <span className="text-xs text-stone-400 dark:text-slate-500">· Directions</span>
            </a>
          </p>
        )}
        {job.clientName && (
          <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
            <span>👤</span>
            <span>
              {job.clientName}
              {job.clientPhone && (
                <>
                  {" · "}
                  <a href={`tel:${job.clientPhone}`} className="text-brand-600">{job.clientPhone}</a>
                </>
              )}
            </span>
          </p>
        )}
        {job.description && <p className="whitespace-pre-wrap text-stone-600 dark:text-slate-300">{job.description}</p>}
      </div>

      {/* Other trades on this site */}
      {(job.tradeVisits || []).filter((v) => v.status !== "cancelled").length > 0 && (
        <Section title="Trades on site">
          <ul className="space-y-2">
            {(job.tradeVisits || [])
              .filter((v) => v.status !== "cancelled")
              .map((v) => (
                <li key={v.id} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${v.status === "done" ? "bg-emerald-500" : "bg-sky-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800 dark:text-slate-100">
                      {v.trade}
                      {v.company && <span className="font-normal text-stone-500 dark:text-slate-400"> · {v.company}</span>}
                    </p>
                    <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                      {v.status === "done" ? "Done · " : ""}
                      {fmtDay(v.scheduledStart)} · from {fmtTime(v.scheduledStart)}
                      {v.notes ? ` · ${v.notes}` : ""}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {/* Install checklist */}
      <Section title="Install checklist">
        <Checklist items={todos} onChange={saveTodos} emptyHint="No checklist for this job yet — add items as you go." />
      </Section>

      {/* Return-trip maintenance checklist */}
      <Section title="Maintenance checks">
        <Checklist
          items={maintenance}
          onChange={saveMaintenance}
          emptyHint="Follow-up checks for a return visit — tick them off as you go."
        />
      </Section>

      {/* Maintenance report — filed from site, lands on the office dashboard */}
      <Section
        title="Maintenance report"
        action={
          <button className="text-sm font-semibold text-brand-600" onClick={() => setShowReport((s) => !s)}>
            {showReport ? "Hide" : latestReport ? "Edit" : "Create"}
          </button>
        }
      >
        {!showReport && (
          <p className="text-sm text-stone-400 dark:text-slate-500">
            {latestReport
              ? latestReport.status === "sent"
                ? "Report sent to the client — open it to make changes."
                : "Draft saved — open it to finish and send."
              : "Fill out the maintenance report before you leave site. The office and the client both get the PDF."}
          </p>
        )}
        {showReport && <ReportEditor job={job} existing={latestReport} onSaved={load} installerId={installerId} />}
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card mb-3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

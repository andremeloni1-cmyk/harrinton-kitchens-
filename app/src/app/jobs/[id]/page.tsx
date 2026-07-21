"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StagePill } from "@/components/StagePill";
import { StageTimeline } from "@/components/StageTimeline";
import { SiteVisitBooking } from "@/components/SiteVisitBooking";
import { DrawingSets } from "@/components/DrawingSets";
import { VariationList } from "@/components/VariationList";
import { CutList } from "@/components/CutList";
import { PartsProgress } from "@/components/PartsProgress";
import { InstallBooking } from "@/components/InstallBooking";
import { InvoiceStatusPill } from "@/components/InvoiceStatusPill";
import { Modal } from "@/components/Modal";
import { JobForm } from "@/components/JobForm";
import { ReportEditor } from "@/components/ReportEditor";
import { RescheduleModal } from "@/components/RescheduleModal";
import { Checklist } from "@/components/Checklist";
import { PlanReview } from "@/components/PlanReview";
import { TradeSchedule } from "@/components/TradeSchedule";
import { PhotoUpload } from "@/components/PhotoUpload";
import { PriceItemPicker } from "@/components/PriceItemPicker";
import { fmtMoney, fmtDay, fmtRange, relativeTime } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { queueMutation } from "@/lib/offline-queue";
import type { ChecklistItem } from "@/lib/pdf";
import {
  PIPELINE_STAGES,
  STAGE_META,
  STAGE_GROUPS,
  STAGE_GROUP_META,
  stageLabel,
  nextStage,
  isStage,
  isTerminalStage,
  type PipelineStage,
} from "@/lib/pipeline";

// Persist a background PATCH; if it fails (offline), queue it to replay when
// the connection returns.
function savePatch(url: string, body: unknown) {
  api(url, { method: "PATCH", body: JSON.stringify(body) }).catch(() => {
    queueMutation(url, "PATCH", body).then(() => window.dispatchEvent(new CustomEvent("jf-offline-queued")));
  });
}

type EstimateLine = { description: string; quantity: number; unitAmount: number };

function parseEstimate(raw?: string): EstimateLine[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((i) => i && typeof i.description === "string");
  } catch {
    /* ignore */
  }
  return [];
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

const stagesInGroup = (g: (typeof STAGE_GROUPS)[number]): PipelineStage[] =>
  PIPELINE_STAGES.filter((s) => STAGE_META[s].group === g);

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [showStages, setShowStages] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [todos, setTodos] = useState<ChecklistItem[]>([]);
  const [maintenance, setMaintenance] = useState<ChecklistItem[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [estimate, setEstimate] = useState<EstimateLine[]>([]);
  const [estimatePicker, setEstimatePicker] = useState(false);
  const [estimateBusy, setEstimateBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { job } = await api<{ job: JobDTO }>(`/api/jobs/${id}`);
      setJob(job);
      setTodos(parseChecklist(job.todos));
      setMaintenance(parseChecklist(job.maintenanceTasks));
      setEstimate(parseEstimate(job.estimateItems));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Open the report editor directly when linked from the Reports section.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("report") === "1") {
      setShowReport(true);
    }
  }, []);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  // Checklists autosave: update local state immediately, persist in the
  // background — and if the request fails (offline), queue it to replay later
  // so a tick made in a kitchen with no signal isn't lost.
  function saveTodos(items: ChecklistItem[]) {
    setTodos(items);
    savePatch(`/api/jobs/${id}/todos`, { items });
  }
  function saveMaintenance(items: ChecklistItem[]) {
    setMaintenance(items);
    savePatch(`/api/jobs/${id}/maintenance`, { items });
  }
  async function generateTodos() {
    setGenBusy(true);
    try {
      const res = await api<{ todos: ChecklistItem[]; added: number }>(`/api/jobs/${id}/todos`, { method: "POST" });
      setTodos(res.todos);
      flash(res.added > 0 ? `Added ${res.added} to-do item(s)` : "To-do list already covers the description");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't generate the to-do list");
    } finally {
      setGenBusy(false);
    }
  }
  async function seedMaintenance() {
    setSeedBusy(true);
    try {
      const res = await api<{ maintenance: ChecklistItem[] }>(`/api/jobs/${id}/maintenance`, { method: "POST" });
      setMaintenance(res.maintenance);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't add the maintenance items");
    } finally {
      setSeedBusy(false);
    }
  }

  // Estimate: autosave on change; "Set as quote" also writes quoteAmount.
  function saveEstimate(items: EstimateLine[], setQuote = false) {
    setEstimate(items);
    const req = api<{ quoteAmount: number | null }>(`/api/jobs/${id}/estimate`, {
      method: "PATCH",
      body: JSON.stringify({ items, setQuote }),
    });
    if (setQuote) {
      setEstimateBusy("quote");
      req
        .then(() => {
          flash("Quote updated from the estimate");
          return load();
        })
        .catch((e) => flash(e instanceof Error ? e.message : "Couldn't set the quote"))
        .finally(() => setEstimateBusy(null));
    } else {
      // Offline? Queue the estimate save so on-site line edits aren't lost.
      req.catch(() => {
        queueMutation(`/api/jobs/${id}/estimate`, "PATCH", { items, setQuote: false }).then(() =>
          window.dispatchEvent(new CustomEvent("jf-offline-queued"))
        );
      });
    }
  }
  async function suggestEstimate() {
    setEstimateBusy("suggest");
    try {
      const { lines } = await api<{ lines: EstimateLine[] }>(`/api/jobs/${id}/estimate`, { method: "POST" });
      if (lines.length === 0) flash("Nothing on the price list clearly matched the description");
      else saveEstimate([...estimate, ...lines]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't suggest an estimate");
    } finally {
      setEstimateBusy(null);
    }
  }

  // Build the quote PDF and either share it via the native sheet or download it.
  async function buildQuote(mode: "share" | "download") {
    setEstimateBusy(mode === "share" ? "share" : "download");
    try {
      const res = await api<{ pdfBase64?: string; filename?: string; error?: string }>(
        `/api/jobs/${id}/quote`,
        { method: "POST" }
      );
      if (!res.pdfBase64 || !res.filename) return flash(res.error || "Couldn't build the quote PDF.");
      const blob = b64ToBlob(res.pdfBase64, "application/pdf");
      if (mode === "share" && typeof navigator !== "undefined" && navigator.canShare) {
        const file = new File([blob], res.filename, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: res.filename, text: `${job?.title ?? "Job"} — quote` });
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // share sheet cancelled
      flash(e instanceof Error ? e.message : "Couldn't build the quote PDF.");
    } finally {
      setEstimateBusy(null);
    }
  }

  async function changeStage(stage: string) {
    if (!job) return;
    setBusy(true);
    setShowStages(false);
    try {
      await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ pipelineStage: stage }) });
      if (stage === "DEPOSIT") flash("Confirmed — calendar updated & client emailed (if Google connected)");
      else if (stage === "CANCELLED") flash("Cancelled — calendar cleared & client emailed");
      else flash(`Moved to ${stageLabel(stage)}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function duplicateJob() {
    if (!job) return;
    setBusy(true);
    try {
      const { job: copy } = await api<{ job: JobDTO }>(`/api/jobs/${job.id}/duplicate`, { method: "POST" });
      router.push(`/jobs/${copy.id}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't duplicate the job");
      setBusy(false);
    }
  }

  async function saveEdit(payload: Record<string, unknown>) {
    if (!job) return;
    await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setEditing(false);
    await load();
  }

  async function remove() {
    if (!job) return;
    // Two-tap inline confirm (window.confirm is unreliable in standalone PWAs).
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  async function rereadImages() {
    if (!job) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; images?: number; message?: string }>(
        `/api/jobs/${job.id}/reread-images`,
        { method: "POST" }
      );
      flash(res.ok ? `Re-read ${res.images} image(s) — details updated` : res.message || "Couldn't re-read images");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    if (!job) return;
    setBusy(true);
    try {
      await api("/api/invoices", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
      router.push("/invoices");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't create the invoice");
      setBusy(false);
    }
  }

  async function syncPdfs() {
    if (!job) return;
    setBusy(true);
    try {
      const res = await api<{ saved: number; connected: boolean; message?: string }>(
        `/api/jobs/${job.id}/sync-pdfs`,
        { method: "POST" }
      );
      if (!res.connected) flash(res.message || "Connect Google in Settings to search email.");
      else flash(res.saved > 0 ? `Saved ${res.saved} PDF(s) to Drive` : "No new PDFs found in email");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;
  if (!job) return <div className="px-4 pt-6 text-stone-500 dark:text-slate-400">Job not found. <Link href="/" className="text-brand-600">Back</Link></div>;

  const currentStage: PipelineStage = isStage(job.pipelineStage) ? job.pipelineStage : "ENQUIRY";
  const terminal = isTerminalStage(currentStage);
  const next = terminal ? null : nextStage(currentStage);
  const latestReport = job.reports?.[0] || null;

  return (
    <div className="px-4 pt-5">
      {toast && (
        <div className="toast-in fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        All jobs
      </Link>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">{job.title}</h1>
          <StagePill stage={job.pipelineStage} />
        </div>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{job.reference}</p>
        {job.leadSource && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
              </svg>
              Imported from email · {job.leadSource}
            </span>
            {job.gmailMessageId && (
              <button
                onClick={rereadImages}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-200 disabled:opacity-50 dark:bg-night-800 dark:text-slate-300 dark:hover:bg-night-850"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Re-read images with AI
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pipeline header — where the job is on the ENQUIRY→HANDOVER spine */}
      <StageTimeline stage={job.pipelineStage} scheduledStart={job.scheduledStart} completedAt={job.completedAt} />

      {/* Primary actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        {terminal ? (
          <button className="btn-secondary" disabled={busy} onClick={() => setShowStages(true)}>
            Reopen job
          </button>
        ) : (
          <>
            {next && (
              <button className="btn-primary" disabled={busy} onClick={() => changeStage(next)}>
                Advance to {stageLabel(next)}
              </button>
            )}
            <button className="btn-secondary" disabled={busy} onClick={() => setShowStages(true)}>
              Change stage
            </button>
          </>
        )}
        <button className="btn-secondary" onClick={() => setRescheduling(true)}>
          {job.scheduledStart ? "Reschedule" : "Schedule"}
        </button>
        {!terminal && (
          <button className="btn-ghost text-red-600" disabled={busy} onClick={() => changeStage("CANCELLED")}>
            Cancel job
          </button>
        )}
      </div>

      {/* Stage picker — jump anywhere on the spine, or reopen a closed job */}
      <Modal open={showStages} onClose={() => setShowStages(false)} title="Move to stage">
        <div className="space-y-4">
          {STAGE_GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                {STAGE_GROUP_META[g].label}
              </p>
              <div className="flex flex-wrap gap-2">
                {stagesInGroup(g).map((s) => {
                  const isCurrent = s === currentStage;
                  return (
                    <button
                      key={s}
                      disabled={busy || isCurrent}
                      onClick={() => changeStage(s)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition disabled:opacity-100 ${
                        isCurrent
                          ? STAGE_GROUP_META[g].pill
                          : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50 dark:bg-night-900 dark:text-slate-300 dark:ring-night-line dark:hover:bg-night-800"
                      }`}
                    >
                      {stageLabel(s)}
                      {isCurrent && " ·"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="border-t border-stone-100 pt-3 dark:border-night-line">
            <button className="btn-ghost text-red-600" disabled={busy} onClick={() => changeStage("LOST")}>
              Mark as lost
            </button>
          </div>
        </div>
      </Modal>

      {/* Schedule + money card */}
      <div className="card mb-3 divide-y divide-stone-100 dark:divide-night-line">
        <Row icon="cal" label="Scheduled">
          {job.scheduledStart ? (
            <span>
              {fmtDay(job.scheduledStart)} · {fmtRange(job.scheduledStart, job.scheduledEnd)}
            </span>
          ) : (
            <span className="text-stone-400 dark:text-slate-500">Not scheduled</span>
          )}
        </Row>
        <Row icon="money" label="Value">{fmtMoney(job.quoteAmount, job.currency)}</Row>
        {job.googleEventId && (
          <Row icon="cal" label="Calendar">
            <span className="text-emerald-600 dark:text-emerald-400">On Google Calendar ✓</span>
          </Row>
        )}
      </div>

      {/* Client card */}
      <div className="card mb-3 divide-y divide-stone-100 dark:divide-night-line">
        <Row icon="user" label="Installer">
          {job.installer ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: job.installer.color || "#0d9488" }} />
              <Link href="/installers" className="text-brand-600">{job.installer.name}</Link>
            </span>
          ) : (
            <button onClick={() => setEditing(true)} className="text-stone-400 underline decoration-dotted dark:text-slate-500">
              Unassigned — assign
            </button>
          )}
        </Row>
        <Row icon="user" label="Client">{job.companyName || job.clientName || "—"}</Row>
        {job.companyName && job.clientName && (
          <Row icon="user" label="Site contact">{job.clientName}</Row>
        )}
        {job.clientPhone && (
          <Row icon="phone" label="Phone">
            <a href={`tel:${job.clientPhone}`} className="text-brand-600">{job.clientPhone}</a>
          </Row>
        )}
        {job.clientEmail && (
          <Row icon="mail" label="Email">
            <a href={`mailto:${job.clientEmail}`} className="text-brand-600">{job.clientEmail}</a>
          </Row>
        )}
        {job.address && (
          <Row icon="pin" label="Address">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600"
            >
              {job.address}
              <span className="ml-1 text-xs text-stone-400 dark:text-slate-500">· Directions</span>
            </a>
          </Row>
        )}
      </div>

      {job.description && (
        <div className="card mb-3 p-4">
          <p className="label mb-1">Description</p>
          <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-slate-200">{job.description}</p>
        </div>
      )}

      {/* Site visits — consultation and check measure */}
      <SiteVisitBooking jobId={id} type="CONSULT" />
      <SiteVisitBooking jobId={id} type="CHECK_MEASURE" />

      {/* Design drawings — sets and revisions */}
      <DrawingSets jobId={id} />

      {/* Variations — scope changes, priced and sent for approval */}
      <VariationList jobId={id} />

      {/* Cut list — cabinets & parts extracted from the CAD PDF */}
      <CutList jobId={id} />

      {/* Part-level production progress from factory scans */}
      <PartsProgress jobId={id} />

      {/* Multi-day crewed install booking (gated on dispatch) */}
      <InstallBooking jobId={id} />

      {/* Component estimate from the price list */}
      <Section title="Estimate">
        {estimate.length === 0 ? (
          <p className="mb-3 text-sm text-stone-400 dark:text-slate-500">
            Build the quote from your price list before the work starts. It becomes the invoice&apos;s lines.
          </p>
        ) : (
          <ul className="mb-3 space-y-2">
            {estimate.map((line, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-200">{line.description}</span>
                <input
                  className="input w-16 px-2 py-1 text-center text-sm"
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...estimate];
                    next[idx] = { ...line, quantity: Number(e.target.value) };
                    saveEstimate(next);
                  }}
                />
                <span className="w-20 shrink-0 text-right text-stone-500 dark:text-slate-400">
                  {fmtMoney(line.unitAmount, job.currency)}
                </span>
                <span className="w-20 shrink-0 text-right font-medium text-stone-800 dark:text-slate-100">
                  {fmtMoney(line.quantity * line.unitAmount, job.currency)}
                </span>
                <button
                  onClick={() => saveEstimate(estimate.filter((_, i) => i !== idx))}
                  className="shrink-0 rounded-full p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-500 dark:text-slate-600 dark:hover:bg-night-800"
                  aria-label="Remove line"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
            <li className="flex items-baseline justify-between border-t border-stone-100 pt-2 text-sm dark:border-night-line">
              <span className="font-semibold text-stone-800 dark:text-slate-100">Estimate total</span>
              <span className="font-bold text-stone-900 dark:text-slate-100">
                {fmtMoney(estimate.reduce((s, l) => s + l.quantity * l.unitAmount, 0), job.currency)}
              </span>
            </li>
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <button onClick={() => setEstimatePicker(true)} className="text-sm font-medium text-brand-600">
            + Add from price list
          </button>
          <button
            onClick={suggestEstimate}
            disabled={estimateBusy !== null}
            className="text-sm font-medium text-brand-600 disabled:opacity-50"
          >
            {estimateBusy === "suggest" ? "Suggesting…" : "Suggest from description"}
          </button>
          {estimate.length > 0 && (
            <button
              onClick={() => saveEstimate(estimate, true)}
              disabled={estimateBusy !== null}
              className="text-sm font-semibold text-brand-600 disabled:opacity-50"
            >
              {estimateBusy === "quote" ? "Setting…" : "Set as quote"}
            </button>
          )}
        </div>
        {(estimate.length > 0 || job.quoteAmount != null) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3 dark:border-night-line">
            <button
              onClick={() => buildQuote("download")}
              disabled={estimateBusy !== null}
              className="btn-secondary disabled:opacity-50"
            >
              {estimateBusy === "download" ? "Building…" : "Download quote PDF"}
            </button>
            <button
              onClick={() => buildQuote("share")}
              disabled={estimateBusy !== null}
              className="btn-secondary disabled:opacity-50"
            >
              {estimateBusy === "share" ? "…" : "Share quote"}
            </button>
          </div>
        )}
        <div className="mt-3 border-t border-stone-100 pt-3 dark:border-night-line">
          <Link
            href={`/jobs/${id}/quote`}
            className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition active:scale-[0.99] dark:bg-brand-500/15 dark:text-brand-300"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 6h9M8 12h9M8 18h5" strokeLinecap="round" />
                <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
              </svg>
              Quote builder — sections, margin & branded PDF
            </span>
            <span aria-hidden>→</span>
          </Link>
        </div>
        {estimatePicker && (
          <PriceItemPicker
            companyId={job.companyId}
            onClose={() => setEstimatePicker(false)}
            onPick={(item) => {
              saveEstimate([
                ...estimate,
                { description: item.name, quantity: 1, unitAmount: item.resolvedPrice ?? item.price },
              ]);
              setEstimatePicker(false);
            }}
          />
        )}
      </Section>

      {/* To-do list (auto-drafted from the description with AI) */}
      <Section title="To-do">
        <Checklist
          items={todos}
          onChange={saveTodos}
          emptyHint="No to-do items yet. Generate a list from the job description, or add your own."
          action={{ label: "Generate", onClick: generateTodos, busy: genBusy }}
        />
      </Section>

      {/* Plans for client review */}
      <Section title="Plans — client review">
        <PlanReview jobId={job.id} plans={(job.documents || []).filter((d) => d.source === "plan")} onChanged={load} />
      </Section>

      {/* Trade site schedule */}
      <Section title="Trade schedule">
        <TradeSchedule jobId={job.id} visits={job.tradeVisits || []} onChanged={load} />
      </Section>

      {/* Documents */}
      <Section
        title="Documents"
        action={
          <div className="flex items-center gap-3">
            {job.driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${job.driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-brand-600"
              >
                Drive folder
              </a>
            )}
            <button className="text-sm font-semibold text-brand-600" onClick={syncPdfs} disabled={busy}>
              Find in email
            </button>
          </div>
        }
      >
        {job.documents && job.documents.filter((d) => !["upload", "plan"].includes(d.source)).length > 0 ? (
          <ul className="space-y-2">
            {job.documents.filter((d) => !["upload", "plan"].includes(d.source)).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
                  <span>📄</span>
                  <span className="truncate">{d.name}</span>
                </span>
                {d.webViewLink ? (
                  <a href={d.webViewLink} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-brand-600">
                    Open
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">{d.source}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400 dark:text-slate-500">
            No documents yet. Tap “Find in email” to pull job PDFs from Gmail into Google Drive.
          </p>
        )}
      </Section>

      {/* Invoices */}
      <Section
        title="Invoice"
        action={
          (!job.invoices || job.invoices.length === 0) && (
            <button className="text-sm font-semibold text-brand-600" onClick={createInvoice} disabled={busy}>
              Create invoice
            </button>
          )
        }
      >
        {job.invoices && job.invoices.length > 0 ? (
          <ul className="space-y-2">
            {job.invoices.map((inv) => (
              <li key={inv.id}>
                <Link href="/invoices" className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
                    <span>🧾</span>
                    <span className="truncate font-medium">{inv.number}</span>
                    <span className="shrink-0 text-stone-500 dark:text-slate-400">{fmtMoney(inv.total, inv.currency)}</span>
                  </span>
                  <InvoiceStatusPill status={inv.status} overdue={inv.overdue} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400 dark:text-slate-500">
            No invoice yet. One is drafted automatically when the job is completed, or create it now from the quote.
          </p>
        )}
      </Section>

      {/* Return-trip maintenance checklist */}
      <Section title="Return-trip maintenance">
        <Checklist
          items={maintenance}
          onChange={saveMaintenance}
          emptyHint="Follow-up checks for a return visit. Add the standard list, or your own items."
          action={{ label: "Add standard items", onClick: seedMaintenance, busy: seedBusy }}
        />
      </Section>

      {/* Maintenance report */}
      <Section
        title="Maintenance report"
        action={
          <button className="text-sm font-semibold text-brand-600" onClick={() => setShowReport((s) => !s)}>
            {showReport ? "Hide" : latestReport ? "Edit" : "Create"}
          </button>
        }
      >
        {latestReport && !showReport && (
          <p className="text-sm text-stone-600 dark:text-slate-300">
            {latestReport.status === "sent" ? `Sent ${relativeTime(latestReport.sentAt)}` : "Draft saved"}
            {latestReport.webViewLink && (
              <>
                {" · "}
                <a href={latestReport.webViewLink} target="_blank" rel="noreferrer" className="text-brand-600">
                  View on Drive
                </a>
              </>
            )}
          </p>
        )}
        {!latestReport && !showReport && (
          <p className="text-sm text-stone-400 dark:text-slate-500">Fill out a maintenance report and email it to the client as a PDF.</p>
        )}
        {showReport && <ReportEditor job={job} existing={latestReport} onSaved={load} />}
      </Section>

      {/* Site photos — uploaded into the shared "Photos (client)" Drive folder */}
      <Section title="Site photos">
        <PhotoUpload job={job} onChanged={load} />
      </Section>

      {/* Activity */}
      {job.activities && job.activities.length > 0 && (
        <Section title="Activity">
          <ul className="space-y-3">
            {job.activities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <div>
                  <p className="text-stone-700 dark:text-slate-200">{a.message}</p>
                  <p className="text-xs text-stone-400 dark:text-slate-500">{relativeTime(a.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Footer actions */}
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="btn-secondary flex-1" onClick={() => setEditing(true)}>
          Edit job
        </button>
        <button className="btn-secondary flex-1" disabled={busy} onClick={duplicateJob}>
          {busy ? "…" : "Duplicate"}
        </button>
        {confirmDelete ? (
          <>
            <button className="btn-danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
            <button className="btn-ghost text-stone-500 dark:text-slate-400" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn-danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
      {confirmDelete && (
        <p className="mt-2 text-right text-xs text-stone-400 dark:text-slate-500">This also removes its calendar event.</p>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit job">
        <JobForm job={job} onSubmit={saveEdit} onCancel={() => setEditing(false)} />
      </Modal>

      <RescheduleModal job={job} open={rescheduling} onClose={() => setRescheduling(false)} onDone={load} />
    </div>
  );
}

function b64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
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

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-stone-400 dark:text-slate-500"><RowIcon name={icon} /></span>
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-stone-800 dark:text-slate-100">{children}</span>
    </div>
  );
}

function RowIcon({ name }: { name: string }) {
  const cls = "h-4 w-4";
  switch (name) {
    case "cal":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" /></svg>;
    case "money":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" /></svg>;
    case "user":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>;
    case "phone":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" strokeLinejoin="round" /></svg>;
    case "mail":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case "pin":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    default:
      return null;
  }
}

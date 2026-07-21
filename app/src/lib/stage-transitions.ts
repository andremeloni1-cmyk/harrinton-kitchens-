// The stage-automation matrix: which side effects fire when a job enters a
// pipeline stage. This is the generalised form of the old status switch in
// automations.ts — pure data + a pure selector, so the whole matrix is unit
// testable without a database. automations.ts owns the execution (mapping each
// effect name to its real async function).
//
// Effects are keyed by the stage a job ENTERS (not the (from,to) pair): the old
// lifecycle fired purely on the new status, and keeping the same shape means
// legacy flows behave identically, including re-entry (e.g. reopening a job
// re-runs the target stage's effects, exactly as before).

import { PIPELINE_STAGES, TERMINAL_STAGES, type PipelineStage } from "./pipeline";

export type StageEffect =
  | "calendar_sync" // ensure/refresh the Google Calendar event(s)
  | "calendar_remove" // delete the calendar event(s)
  | "email_accepted" // templated "accepted" email to the client
  | "email_cancelled" // templated "cancelled" email to the client
  | "sync_pdfs" // pull job PDFs from Gmail into Drive (Google-gated)
  | "draft_invoice" // auto-draft the completion invoice
  | "portal_event" // record a client-facing milestone on the timeline
  | "push_office" // push-notify office/factory staff
  | "init_factory"; // create the job's per-station progress records

// Effects fired on entry to each stage. The five legacy-reachable stages
// (ENQUIRY, DEPOSIT, INSTALL, HANDOVER, CANCELLED) reproduce the old status
// switch exactly; the richer stages add portal/push milestones that become
// reachable once the pipeline UI can walk them (P3.3).
export const STAGE_EFFECTS: Record<PipelineStage, StageEffect[]> = {
  // --- Sales ---
  ENQUIRY: [], // legacy "lead" — no side effects
  CONSULT: ["calendar_sync", "portal_event"],
  QUOTE: ["portal_event"],
  DEPOSIT: ["calendar_sync", "email_accepted", "sync_pdfs"], // legacy "accepted"
  // --- Pre-production ---
  CHECK_MEASURE: ["calendar_sync", "portal_event"],
  DESIGN: ["portal_event"],
  APPROVAL: ["portal_event", "push_office"],
  // --- Factory ---
  PRODUCTION: ["push_office", "init_factory"],
  QUALITY: ["push_office"],
  DELIVERY: ["calendar_sync", "portal_event"],
  // --- Field ---
  INSTALL: ["calendar_sync"], // legacy "scheduled" / "in_progress"
  HANDOVER: ["calendar_sync", "draft_invoice"], // legacy "completed"
  MAINTENANCE: ["calendar_sync", "portal_event"],
  // --- Terminal ---
  LOST: ["calendar_remove"], // internal loss — no client email
  CANCELLED: ["calendar_remove", "email_cancelled"], // legacy "cancelled"
};

/**
 * The effects to fire for a transition into `to`. Entry-keyed today (see the
 * file header); `from` is accepted so callers and future from-specific rules
 * have a stable signature. A no-op self-transition (from === to) still returns
 * the entry effects, because collapsed legacy states (scheduled → in_progress,
 * both INSTALL) must keep re-running the idempotent calendar sync.
 */
export function effectsForTransition(
  _from: PipelineStage,
  to: PipelineStage
): StageEffect[] {
  return STAGE_EFFECTS[to];
}

// Every stage in the spine (plus terminals) must have an entry — guarded by the
// Record type above and asserted in tests.
export const STAGE_EFFECT_KEYS: PipelineStage[] = [...PIPELINE_STAGES, ...TERMINAL_STAGES];

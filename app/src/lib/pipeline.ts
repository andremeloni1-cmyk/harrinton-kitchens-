// The job pipeline — one ordered spine of stages spanning the whole journey,
// from first enquiry to post-install maintenance. This supersedes the legacy
// six-value `status` lifecycle (see lib/types.ts): every job now carries a
// `pipelineStage`, and the two are kept mirrored (P3.1) until the pipeline UI
// replaces the status field entirely (P3.3).
//
// Stage colours are semantic and deliberately independent of the company accent
// (a brand-tinted "Production" pill would read as decoration, not state), so
// they use fixed palette tokens rather than the brand-* variables.

// The linear spine, in order. A job walks these front-to-back.
export const PIPELINE_STAGES = [
  "ENQUIRY",
  "CONSULT",
  "QUOTE",
  "DEPOSIT",
  "CHECK_MEASURE",
  "DESIGN",
  "APPROVAL",
  "PRODUCTION",
  "QUALITY",
  "DELIVERY",
  "INSTALL",
  "HANDOVER",
  "MAINTENANCE",
] as const;

// Terminal stages a job can drop into from anywhere on the spine. They sit
// outside the linear order and never appear as "upcoming".
export const TERMINAL_STAGES = ["LOST", "CANCELLED"] as const;

export type LinearStage = (typeof PIPELINE_STAGES)[number];
export type TerminalStage = (typeof TERMINAL_STAGES)[number];
export type PipelineStage = LinearStage | TerminalStage;

export const ALL_STAGES = [...PIPELINE_STAGES, ...TERMINAL_STAGES] as const;

// The default stage for a brand-new job.
export const DEFAULT_STAGE: PipelineStage = "ENQUIRY";

// Four broad phases used to filter and group the pipeline in the UI (P3.3).
// Terminal stages form their own "closed" bucket.
export type StageGroup = "sales" | "preproduction" | "factory" | "field" | "closed";

export const STAGE_GROUPS: StageGroup[] = ["sales", "preproduction", "factory", "field"];

type StageMeta = {
  label: string;
  group: StageGroup;
};

export const STAGE_META: Record<PipelineStage, StageMeta> = {
  ENQUIRY: { label: "Enquiry", group: "sales" },
  CONSULT: { label: "Consultation", group: "sales" },
  QUOTE: { label: "Quote", group: "sales" },
  DEPOSIT: { label: "Deposit", group: "sales" },
  CHECK_MEASURE: { label: "Check measure", group: "preproduction" },
  DESIGN: { label: "Design", group: "preproduction" },
  APPROVAL: { label: "Approval", group: "preproduction" },
  PRODUCTION: { label: "Production", group: "factory" },
  QUALITY: { label: "Quality check", group: "factory" },
  DELIVERY: { label: "Delivery", group: "factory" },
  INSTALL: { label: "Install", group: "field" },
  HANDOVER: { label: "Handover", group: "field" },
  MAINTENANCE: { label: "Maintenance", group: "field" },
  LOST: { label: "Lost", group: "closed" },
  CANCELLED: { label: "Cancelled", group: "closed" },
};

export const STAGE_GROUP_META: Record<
  StageGroup,
  { label: string; pill: string; dot: string }
> = {
  sales: {
    label: "Sales",
    pill: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
    dot: "bg-amber-500",
  },
  preproduction: {
    label: "Pre-production",
    pill: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25",
    dot: "bg-violet-500",
  },
  factory: {
    label: "Factory",
    pill: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
    dot: "bg-sky-500",
  },
  field: {
    label: "Field",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
    dot: "bg-emerald-500",
  },
  closed: {
    label: "Closed",
    pill: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
    dot: "bg-rose-500",
  },
};

export function isStage(s: string): s is PipelineStage {
  return s in STAGE_META;
}

export function isTerminalStage(stage: PipelineStage): stage is TerminalStage {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

export function stageLabel(stage: string): string {
  return isStage(stage) ? STAGE_META[stage].label : stage;
}

export function stageGroup(stage: PipelineStage): StageGroup {
  return STAGE_META[stage].group;
}

/** Position along the linear spine (0-based); -1 for terminal stages. */
export function stageIndex(stage: PipelineStage): number {
  return (PIPELINE_STAGES as readonly string[]).indexOf(stage);
}

/** The next stage along the spine, or null at the end / off the spine. */
export function nextStage(stage: PipelineStage): LinearStage | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[i + 1];
}

/** The pill classes for a stage, coloured by its group (accent-independent). */
export function stagePillClass(stage: PipelineStage): string {
  return STAGE_GROUP_META[STAGE_META[stage].group].pill;
}

/** Where `stage` sits relative to `current`, for timeline rendering. */
export function stageStatus(
  stage: LinearStage,
  current: PipelineStage
): "done" | "current" | "upcoming" {
  if (stage === current) return "current";
  // A job on a terminal stage has left the spine — nothing is "current" and
  // everything before where it dropped off reads as done. Without a spine
  // position to compare against, treat all spine stages as upcoming.
  const here = stageIndex(current);
  if (here < 0) return "upcoming";
  return stageIndex(stage) < here ? "done" : "upcoming";
}

// --- Legacy status bridge (removed in P3.3) -------------------------------
// The old lifecycle had six values: lead | accepted | scheduled | in_progress
// | completed | cancelled (lib/types.ts). We fold them onto the richer spine
// for the migration backfill and keep `status` mirrored from `pipelineStage`
// on every write until the UI stops reading `status`.

export function stageForLegacyStatus(status: string): PipelineStage {
  switch (status) {
    case "lead":
      return "ENQUIRY";
    case "accepted":
      return "DEPOSIT";
    case "scheduled":
    case "in_progress":
      return "INSTALL";
    case "completed":
      return "HANDOVER";
    case "cancelled":
      return "CANCELLED";
    default:
      return DEFAULT_STAGE;
  }
}

export function legacyStatusForStage(stage: PipelineStage): string {
  switch (STAGE_META[stage].group) {
    case "sales":
      return stage === "DEPOSIT" ? "accepted" : "lead";
    case "preproduction":
      return "accepted";
    case "factory":
    case "field":
      return stage === "HANDOVER" || stage === "MAINTENANCE" ? "completed" : "in_progress";
    case "closed":
      return "cancelled";
  }
}

/**
 * The pair of fields to persist for a job whose legacy status is `status`,
 * with `pipelineStage` mirrored so the two never drift. Used at every site
 * that still writes `status` directly, until P3.3 flips the source of truth.
 */
export function jobStageFields(status: string): {
  status: string;
  pipelineStage: PipelineStage;
} {
  return { status, pipelineStage: stageForLegacyStatus(status) };
}

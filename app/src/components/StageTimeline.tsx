import {
  PIPELINE_STAGES,
  STAGE_META,
  STAGE_GROUP_META,
  stageStatus,
  stageLabel,
  stageGroup,
  isTerminalStage,
  isStage,
  type PipelineStage,
} from "@/lib/pipeline";
import { fmtDay } from "@/lib/format";

// The pipeline header for a job: a horizontal, scrollable stepper of the whole
// spine showing what's done, where the job is now, and what's still upcoming,
// with the known dates surfaced under their stages. A job that has dropped to a
// terminal stage (lost/cancelled) shows a banner instead of the spine.
export function StageTimeline({
  stage,
  scheduledStart,
  completedAt,
}: {
  stage: string;
  scheduledStart?: string | null;
  completedAt?: string | null;
}) {
  const current = (isStage(stage) ? stage : "ENQUIRY") as PipelineStage;

  if (isTerminalStage(current)) {
    const meta = STAGE_GROUP_META[stageGroup(current)];
    return (
      <div className={`card mb-4 flex items-center gap-3 p-4 ring-1 ring-inset ${meta.pill}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        <div>
          <p className="text-sm font-semibold">{stageLabel(current)}</p>
          <p className="text-xs opacity-80">This job is off the pipeline. Reopen it to pick back up.</p>
        </div>
      </div>
    );
  }

  // A date to surface under a stage, where we know it.
  const dateFor = (s: PipelineStage): string | null => {
    if (s === "INSTALL" && scheduledStart) return fmtDay(scheduledStart);
    if (s === "HANDOVER" && completedAt) return fmtDay(completedAt);
    return null;
  };

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-stone-900 dark:text-slate-100">{stageLabel(current)}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-slate-500">
          {STAGE_GROUP_META[stageGroup(current)].label}
        </p>
      </div>
      <ol className="no-scrollbar flex gap-1 overflow-x-auto pb-1">
        {PIPELINE_STAGES.map((s) => {
          const state = stageStatus(s, current);
          const dot = STAGE_GROUP_META[STAGE_META[s].group].dot;
          const date = dateFor(s);
          return (
            <li key={s} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
              <span
                className={
                  state === "done"
                    ? `h-2.5 w-2.5 rounded-full ${dot}`
                    : state === "current"
                      ? `h-3.5 w-3.5 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-night-900 ${dot}`
                      : "h-2.5 w-2.5 rounded-full bg-stone-200 dark:bg-night-700"
                }
              />
              <span
                className={`text-[10px] leading-tight ${
                  state === "current"
                    ? "font-semibold text-stone-900 dark:text-slate-100"
                    : state === "done"
                      ? "text-stone-500 dark:text-slate-400"
                      : "text-stone-400 dark:text-slate-600"
                }`}
              >
                {stageLabel(s)}
              </span>
              {date && (
                <span className="text-[9px] leading-tight text-stone-400 dark:text-slate-500">{date}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

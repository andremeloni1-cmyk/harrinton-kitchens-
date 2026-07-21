import { isStage, stageLabel, stagePillClass } from "@/lib/pipeline";

// A stage badge, coloured by pipeline group. The stage is the job's live
// lifecycle position (superseding the old status pill).
export function StagePill({ stage, className = "" }: { stage: string; className?: string }) {
  const cls = isStage(stage) ? stagePillClass(stage) : stagePillClass("ENQUIRY");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls} ${className}`}
    >
      {stageLabel(stage)}
    </span>
  );
}

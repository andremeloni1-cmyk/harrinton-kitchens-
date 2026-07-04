import { STATUS_LABELS, STATUS_STYLES, type JobStatus } from "@/lib/types";

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const s = status as JobStatus;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        STATUS_STYLES[s] || STATUS_STYLES.lead
      } ${className}`}
    >
      {STATUS_LABELS[s] || status}
    </span>
  );
}

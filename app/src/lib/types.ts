// Shared constants and helpers for job statuses & lifecycle.

// Lifecycle: an incoming job is "lead" (To confirm) until the owner confirms it
// → accepted → scheduled → in_progress → completed (cancelled from any state).
// There is no quoting step — jobs only need confirming.
export const JOB_STATUSES = [
  "lead",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const STATUS_LABELS: Record<JobStatus, string> = {
  lead: "To confirm",
  accepted: "Confirmed",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Tailwind classes for status pills.
export const STATUS_STYLES: Record<JobStatus, string> = {
  lead: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  scheduled: "bg-brand-100 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  completed: "bg-green-100 text-green-800 ring-green-300 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25",
  cancelled: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
};

// Which statuses should appear on the calendar (i.e. have a confirmed slot).
export const SCHEDULED_STATUSES: JobStatus[] = [
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
];

export const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-500 dark:bg-night-800 dark:text-slate-400",
  normal: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function isScheduledStatus(s: string): boolean {
  return SCHEDULED_STATUSES.includes(s as JobStatus);
}

// Invoice lifecycle: draft → submitted → authorised → paid | voided.
// "overdue" is derived (authorised, unpaid, past due) — shown, never stored.
export const INVOICE_STATUSES = [
  "draft",
  "submitted",
  "authorised",
  "paid",
  "voided",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus | "overdue", string> = {
  draft: "Draft",
  submitted: "Submitted",
  authorised: "Awaiting payment",
  paid: "Paid",
  voided: "Voided",
  overdue: "Overdue",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus | "overdue", string> = {
  draft: "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-night-800 dark:text-slate-300 dark:ring-night-line",
  submitted: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  authorised: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
  paid: "bg-green-100 text-green-800 ring-green-300 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25",
  voided: "bg-stone-100 text-stone-400 ring-stone-200 dark:bg-night-800 dark:text-slate-500 dark:ring-night-line",
  overdue: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
};

import type { ReactNode } from "react";

/** Consistent empty-state block: optional icon, title, subtitle, and action. */
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && (
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
          {icon}
        </div>
      )}
      <p className="font-semibold text-stone-800 dark:text-slate-100">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-stone-500 dark:text-slate-400">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

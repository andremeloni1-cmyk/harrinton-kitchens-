// A stable placeholder for surfaces whose full build lands in a later phase, so
// the four-surface navigation is complete and each role has a real home now.
export function SurfacePlaceholder({
  title,
  tagline,
  message,
}: {
  title: string;
  tagline: string;
  message: string;
}) {
  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">{tagline}</p>
      </header>
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="font-semibold text-stone-900 dark:text-slate-100">Coming soon</p>
        <p className="max-w-xs text-sm text-stone-500 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
}

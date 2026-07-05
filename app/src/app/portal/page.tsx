import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Demo landing: in production each client receives their own private portal
// link. For the demo, pick a client to preview their view.
export default async function PortalIndexPage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { jobs: { select: { id: true, status: true } } },
  });
  const withJobs = clients.filter((c) => c.jobs.length > 0);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
        <b>Demo preview.</b> In production every client gets their own private link — no login,
        nothing to install. Choose a client below to see exactly what they see.
      </div>

      <h1 className="mb-3 text-xl font-bold text-stone-900 dark:text-slate-100">View portal as…</h1>

      {withJobs.length === 0 ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">
          No clients with jobs yet — seed the demo data (<code>npm run db:seed</code>) or add a job with a client first.
        </p>
      ) : (
        <div className="stagger space-y-2.5">
          {withJobs.map((c) => {
            const activeCount = c.jobs.filter((j) => !["completed", "cancelled"].includes(j.status)).length;
            return (
              <Link key={c.id} href={`/portal/${c.id}`} className="card tap flex items-center gap-3 p-4 transition active:scale-[0.99]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{c.name}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                    {c.jobs.length} project{c.jobs.length === 1 ? "" : "s"}
                    {activeCount > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {activeCount} in flight</span>}
                  </p>
                </div>
                <svg className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/" className="mt-6 block text-center text-xs text-stone-400 underline dark:text-slate-500">
        ← Back to the Harrington Kitchens dashboard
      </Link>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

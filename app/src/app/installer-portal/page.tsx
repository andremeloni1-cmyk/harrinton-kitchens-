import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Demo landing: in production each installer gets their own private link (or
// signs in). For the demo, pick an installer to open their run sheet.
export default async function InstallerPortalIndexPage() {
  const installers = await prisma.installer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { jobs: { where: { status: { in: ["accepted", "scheduled", "in_progress"] } } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
        <b>Demo preview.</b> In production each installer opens their own link on their phone.
        Choose an installer to see their run sheet.
      </div>

      <h1 className="mb-3 text-xl font-bold text-stone-900 dark:text-slate-100">Who&apos;s working today?</h1>

      {installers.length === 0 ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">
          No installers yet — add your team under <Link href="/installers" className="text-brand-600 underline">Installers</Link> first.
        </p>
      ) : (
        <div className="stagger space-y-2.5">
          {installers.map((i) => (
            <Link key={i.id} href={`/installer-portal/${i.id}`} className="card tap flex items-center gap-3 p-4 transition active:scale-[0.99]">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: i.color }}
              >
                {initials(i.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{i.name}</p>
                <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {i.role} · {i._count.jobs} job{i._count.jobs === 1 ? "" : "s"} on the books
                </p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
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

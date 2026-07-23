import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { StatusPill } from "@/components/StatusPill";
import { fmtDay, fmtRange } from "@/lib/format";

export const dynamic = "force-dynamic";

type PortalJob = {
  id: string;
  title: string;
  reference: string;
  status: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  address: string | null;
  clientName: string | null;
  completedAt: Date | null;
};

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export default async function InstallerRunSheetPage({ params }: { params: Promise<{ installerId: string }> }) {
  // The run sheet lists client names, addresses and the schedule for a given
  // installer. Require a staff session so it never renders to the public (P0-1).
  if (!(await getSessionUser())) redirect("/login");

  const { installerId } = await params;
  const installer = await prisma.installer.findUnique({
    where: { id: installerId },
    include: {
      jobs: {
        where: { status: { in: ["accepted", "scheduled", "in_progress", "completed"] } },
        orderBy: [{ scheduledStart: "asc" }],
        select: {
          id: true,
          title: true,
          reference: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          address: true,
          clientName: true,
          completedAt: true,
        },
      },
    },
  });

  if (!installer) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">
          We couldn&apos;t find that installer. <Link href="/installer-portal" className="text-brand-600 underline">Back</Link>
        </p>
      </div>
    );
  }

  const jobs = installer.jobs as PortalJob[];
  const open = jobs.filter((j) => j.status !== "completed");
  const today = open.filter((j) => j.scheduledStart && isToday(j.scheduledStart));
  const upcoming = open.filter((j) => !j.scheduledStart || !isToday(j.scheduledStart));
  const recentDone = jobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
          style={{ backgroundColor: installer.color }}
        >
          {installer.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">G&apos;day {installer.name.split(/\s+/)[0]}</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            {today.length > 0
              ? `${today.length} job${today.length === 1 ? "" : "s"} on site today`
              : "Nothing scheduled today"}
          </p>
        </div>
      </div>

      {today.length > 0 && (
        <Section title="Today">
          {today.map((j) => (
            <JobRow key={j.id} job={j} installerId={installer.id} highlight />
          ))}
        </Section>
      )}

      <Section title="Coming up">
        {upcoming.length === 0 ? (
          <p className="card p-4 text-sm text-stone-400 dark:text-slate-500">No upcoming jobs assigned.</p>
        ) : (
          upcoming.map((j) => <JobRow key={j.id} job={j} installerId={installer.id} />)
        )}
      </Section>

      {recentDone.length > 0 && (
        <Section title="Recently completed">
          {recentDone.map((j) => (
            <JobRow key={j.id} job={j} installerId={installer.id} />
          ))}
        </Section>
      )}

      <Link href="/installer-portal" className="mt-6 block text-center text-xs text-stone-400 underline dark:text-slate-500">
        Switch installer
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function JobRow({ job, installerId, highlight }: { job: PortalJob; installerId: string; highlight?: boolean }) {
  return (
    <Link
      href={`/installer-portal/${installerId}/jobs/${job.id}`}
      className={`card tap block p-4 transition active:scale-[0.99] ${highlight ? "border-l-4 border-brand-500" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{job.title}</p>
          <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">
            {job.clientName || job.reference}
            {job.scheduledStart && <> · {fmtDay(job.scheduledStart)} · {fmtRange(job.scheduledStart, job.scheduledEnd)}</>}
          </p>
          {job.address && <p className="mt-0.5 truncate text-xs text-stone-400 dark:text-slate-500">📍 {job.address}</p>}
        </div>
        <StatusPill status={job.status} />
      </div>
    </Link>
  );
}

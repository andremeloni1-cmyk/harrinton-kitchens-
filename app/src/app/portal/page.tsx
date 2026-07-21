import { prisma } from "@/lib/db";
import { fmtDay, fmtRange, fmtTime, relativeTime } from "@/lib/format";
import { MaintenanceRequestForm } from "@/components/MaintenanceRequestForm";
import { PortalPlanReview } from "@/components/PortalPlanReview";
import { PortalLogin } from "@/components/PortalLogin";
import { PortalSignOut } from "@/components/PortalSignOut";
import { factoryProgress } from "@/lib/factory";
import { PortalQuotes } from "@/components/PortalQuotes";
import { PortalDrawings } from "@/components/PortalDrawings";
import { PortalVariations } from "@/components/PortalVariations";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// The four client-facing milestones. lead → step 0 pending; cancelled handled apart.
const STEPS = ["Confirmed", "Scheduled", "Installation", "Complete"] as const;

function stepIndex(status: string, scheduledStart?: Date | null): number {
  switch (status) {
    case "lead":
      return -1; // awaiting confirmation
    case "accepted":
      return scheduledStart ? 1 : 0;
    case "scheduled":
      return 1;
    case "in_progress":
      return 2;
    case "completed":
      return 3;
    default:
      return -1;
  }
}

export default async function PortalPage() {
  // Portal auth is separate from staff auth — a staff session does not grant
  // access here; the client must have signed in via their emailed magic link.
  const session = await getPortalClient();
  if (!session) return <PortalLogin />;

  const client = await prisma.client.findUnique({
    where: { id: session.id },
    include: {
      jobs: {
        orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
        include: {
          installer: { select: { name: true, role: true, color: true } },
          reports: { where: { status: "sent" }, orderBy: { sentAt: "desc" } },
          documents: {
            where: { sharedWithClient: true, source: "plan" },
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, reviewStatus: true, reviewedAt: true },
          },
          tradeVisits: {
            where: { status: { not: "cancelled" } },
            orderBy: { scheduledStart: "asc" },
          },
          jobStations: { select: { status: true } },
        },
      },
    },
  });

  // Cookie valid but the client record is gone — treat as signed out.
  if (!client) return <PortalLogin />;

  const firstName = client.name.trim().split(/\s+/)[0] || client.name;
  const jobs = client.jobs.filter((j) => j.status !== "cancelled");

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Hi {firstName} 👋</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            Here&apos;s where your kitchen project is up to. We&apos;ll keep this page updated as things move.
          </p>
        </div>
        <PortalSignOut />
      </div>

      <PortalQuotes />
      <PortalDrawings />
      <PortalVariations />

      <div className="space-y-4">
        {jobs.map((job) => {
          const idx = stepIndex(job.status, job.scheduledStart);
          return (
            <div key={job.id} className="card overflow-hidden">
              <div className="border-b border-stone-100 px-4 py-3.5 dark:border-night-line">
                <p className="font-semibold text-stone-900 dark:text-slate-100">{job.title}</p>
                <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">Ref {job.reference}</p>
              </div>

              {/* Progress tracker */}
              <div className="px-4 py-4">
                {idx < 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    We&apos;ve received your job and will confirm your dates shortly.
                  </p>
                ) : (
                  <ol className="flex items-center">
                    {STEPS.map((label, i) => (
                      <li key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                              i <= idx
                                ? "bg-brand-600 text-white"
                                : "bg-stone-100 text-stone-400 dark:bg-night-800 dark:text-slate-500"
                            }`}
                          >
                            {i < idx || idx === STEPS.length - 1 ? "✓" : i + 1}
                          </span>
                          <span
                            className={`mt-1.5 text-[10px] font-medium ${
                              i <= idx ? "text-brand-700 dark:text-brand-300" : "text-stone-400 dark:text-slate-500"
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`mx-1 mb-4 h-0.5 flex-1 rounded ${i < idx ? "bg-brand-500" : "bg-stone-100 dark:bg-night-800"}`} />
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                {job.pipelineStage === "PRODUCTION" && job.jobStations.length > 0 && (
                  <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 dark:bg-brand-500/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-800 dark:text-brand-200">In production</span>
                      <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
                        {factoryProgress(job.jobStations).done}/{factoryProgress(job.jobStations).total} stations
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/60 dark:bg-night-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${factoryProgress(job.jobStations).pct}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Plans to review */}
              {job.documents.length > 0 && (
                <div className="space-y-2.5 border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your plans</p>
                  {job.documents.map((d) => (
                    <PortalPlanReview
                      key={d.id}
                      clientId={client.id}
                      plan={{ ...d, reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null }}
                    />
                  ))}
                </div>
              )}

              {/* Who's coming to site */}
              {job.tradeVisits.length > 0 && (
                <div className="border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                    Who&apos;s coming to your home
                  </p>
                  <ol className="space-y-2">
                    {job.tradeVisits.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 text-sm">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${v.status === "done" ? "bg-emerald-500" : "bg-sky-500"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-stone-800 dark:text-slate-100">
                            {v.trade}
                            {v.company && <span className="font-normal text-stone-500 dark:text-slate-400"> · {v.company}</span>}
                          </p>
                          <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                            {v.status === "done" ? "Completed · " : ""}
                            {fmtDay(v.scheduledStart)} · from {fmtTime(v.scheduledStart)}
                            {v.notes ? ` · ${v.notes}` : ""}
                          </p>
                        </div>
                        {v.status === "done" && <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓</span>}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[11px] text-stone-400 dark:text-slate-500">
                    Times are approximate — each trade will knock/ring when they arrive.
                  </p>
                </div>
              )}

              <div className="space-y-2.5 border-t border-stone-100 px-4 py-3.5 text-sm dark:border-night-line">
                {job.scheduledStart && (
                  <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
                    <span>📅</span>
                    <span>
                      {job.status === "completed" ? "Installed" : "Installation"}: <b>{fmtDay(job.scheduledStart)}</b>
                      {job.status !== "completed" && <> · we arrive {fmtRange(job.scheduledStart, null).split("–")[0].trim()}</>}
                    </span>
                  </p>
                )}
                {job.address && (
                  <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
                    <span>📍</span> {job.address}
                  </p>
                )}
                {job.installer && (
                  <p className="flex items-center gap-2 text-stone-700 dark:text-slate-200">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: job.installer.color || "#0d9488" }}
                    >
                      {job.installer.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span>
                      Your installer: <b>{job.installer.name}</b>
                      <span className="text-stone-400 dark:text-slate-500"> · {job.installer.role}</span>
                    </span>
                  </p>
                )}
                {job.reports.length > 0 && (
                  <div className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-night-850">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Reports</p>
                    {job.reports.map((r) => (
                      <p key={r.id} className="flex items-center justify-between gap-2 py-0.5 text-stone-700 dark:text-slate-200">
                        <span>📋 Maintenance report · {relativeTime(r.sentAt)}</span>
                        {r.webViewLink && (
                          <a href={r.webViewLink} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-brand-600">
                            View
                          </a>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {jobs.length === 0 && (
          <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">No projects on file yet.</p>
        )}
      </div>

      {/* Maintenance / warranty request */}
      <div className="card mt-6 p-4">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Need something adjusted?</h2>
        <p className="mb-3 mt-1 text-sm text-stone-500 dark:text-slate-400">
          Doors settling, a drawer out of line, silicone touch-ups — tell us and we&apos;ll book a maintenance visit.
        </p>
        <MaintenanceRequestForm clientId={client.id} jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
      </div>
    </div>
  );
}

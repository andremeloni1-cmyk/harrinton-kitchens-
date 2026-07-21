import { prisma } from "@/lib/db";
import { fmtDay, fmtRange, fmtTime, relativeTime } from "@/lib/format";
import { MaintenanceRequestForm } from "@/components/MaintenanceRequestForm";
import { PortalPlanReview } from "@/components/PortalPlanReview";
import { PortalLogin } from "@/components/PortalLogin";
import { PortalSignOut } from "@/components/PortalSignOut";
import { factoryProgress, overallPartProgress } from "@/lib/factory";
import { clientMilestones, whatsNext } from "@/lib/portal-timeline";
import { PortalQuotes } from "@/components/PortalQuotes";
import { PortalDrawings } from "@/components/PortalDrawings";
import { PortalVariations } from "@/components/PortalVariations";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

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
            where: { sharedWithClient: true },
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, source: true, mimeType: true, webViewLink: true, reviewStatus: true, reviewedAt: true },
          },
          approvals: { select: { kind: true, decision: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          checkMeasure: { select: { completedAt: true } },
          tradeVisits: {
            where: { status: { not: "cancelled" } },
            orderBy: { scheduledStart: "asc" },
          },
          jobStations: { select: { status: true, createdAt: true } },
          snags: { select: { status: true } },
        },
      },
    },
  });

  // Cookie valid but the client record is gone — treat as signed out.
  if (!client) return <PortalLogin />;

  const firstName = client.name.trim().split(/\s+/)[0] || client.name;
  const jobs = client.jobs.filter((j) => j.status !== "cancelled");

  // Client-safe production progress (P8.3): a single % per job, averaged across
  // parts from label scans — no station names or internal detail leak out.
  const productionJobIds = jobs.filter((j) => j.pipelineStage === "PRODUCTION").map((j) => j.id);
  const partPctByJob = new Map<string, number>();
  if (productionJobIds.length) {
    const stationsOrdered = await prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { id: true } });
    const stationIndex = new Map(stationsOrdered.map((s, i) => [s.id, i]));
    if (stationsOrdered.length) {
      const parts = await prisma.part.findMany({ where: { jobId: { in: productionJobIds }, kind: "panel" }, select: { jobId: true, lastStationId: true } });
      const byJob = new Map<string, (number | null)[]>();
      for (const p of parts) {
        const arr = byJob.get(p.jobId) ?? [];
        arr.push(p.lastStationId != null ? stationIndex.get(p.lastStationId) ?? null : null);
        byJob.set(p.jobId, arr);
      }
      for (const [jid, idxs] of byJob) partPctByJob.set(jid, overallPartProgress(idxs, stationsOrdered.length));
    }
  }

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
          const firstStation = job.jobStations.length
            ? [...job.jobStations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0].createdAt.toISOString()
            : null;
          const ms = clientMilestones(job.pipelineStage, {
            enquiry: job.createdAt.toISOString(),
            quote: job.approvals.find((a) => a.kind === "quote" && a.decision === "accepted")?.createdAt.toISOString() ?? null,
            measure: job.checkMeasure?.completedAt?.toISOString() ?? null,
            design: job.approvals.find((a) => a.kind === "design")?.createdAt.toISOString() ?? null,
            production: firstStation,
            install: job.scheduledStart?.toISOString() ?? null,
            handover: job.approvals.find((a) => a.kind === "handover")?.createdAt.toISOString() ?? null,
          });
          const nextCopy = whatsNext(job.pipelineStage);
          const photos = job.documents.filter((d) => (d.mimeType || "").startsWith("image/"));
          const handoverPack = job.documents.find((d) => d.source === "handover");
          return (
            <div key={job.id} className="card overflow-hidden">
              <div className="border-b border-stone-100 px-4 py-3.5 dark:border-night-line">
                <p className="font-semibold text-stone-900 dark:text-slate-100">{job.title}</p>
                <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">Ref {job.reference}</p>
              </div>

              {/* Project timeline — "where's my kitchen?" at a glance */}
              <div className="px-4 py-4">
                <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">{nextCopy}</p>
                <ol className="relative ml-1 space-y-3 border-l border-stone-200 pl-5 dark:border-night-line">
                  {ms.map((m) => (
                    <li key={m.key} className="relative">
                      <span
                        className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                          m.done ? "bg-brand-600" : m.current ? "bg-white ring-2 ring-brand-500 dark:bg-night-900" : "bg-stone-200 dark:bg-night-700"
                        }`}
                      >
                        {m.done ? "✓" : ""}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm ${m.current ? "font-semibold text-stone-900 dark:text-slate-100" : m.done ? "text-stone-600 dark:text-slate-300" : "text-stone-400 dark:text-slate-500"}`}>
                          {m.label}
                        </span>
                        {m.date && <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">{fmtDay(m.date)}</span>}
                      </div>
                    </li>
                  ))}
                </ol>

                {job.pipelineStage === "PRODUCTION" && (job.jobStations.length > 0 || partPctByJob.has(job.id)) && (() => {
                  // Prefer the part-level % when we have scans; else fall back to stations.
                  const pct = partPctByJob.has(job.id) ? partPctByJob.get(job.id)! : factoryProgress(job.jobStations).pct;
                  return (
                    <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 dark:bg-brand-500/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand-800 dark:text-brand-200">In production</span>
                        <span className="text-xs font-medium text-brand-700 dark:text-brand-300">{pct}% complete</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/60 dark:bg-night-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {job.snags.length > 0 && (() => {
                  const done = job.snags.filter((s) => s.status === "resolved").length;
                  const total = job.snags.length;
                  const allDone = done === total;
                  return (
                    <div className={`mt-3 rounded-xl px-3 py-2.5 ${allDone ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-stone-50 dark:bg-night-850"}`}>
                      <p className="text-sm font-semibold text-stone-700 dark:text-slate-200">
                        {allDone ? "✓ Finishing touches complete" : "Finishing touches"}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">{done} of {total} items done{allDone ? "" : " — our team is on it"}</p>
                    </div>
                  );
                })()}
              </div>

              {/* Plans to review */}
              {job.documents.some((d) => d.source === "plan") && (
                <div className="space-y-2.5 border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your plans</p>
                  {job.documents.filter((d) => d.source === "plan").map((d) => (
                    <PortalPlanReview
                      key={d.id}
                      clientId={client.id}
                      plan={{ ...d, reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null }}
                    />
                  ))}
                </div>
              )}

              {/* Curated progress photos (only ones staff shared) */}
              {photos.length > 0 && (
                <div className="border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Progress photos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <a key={p.id} href={p.webViewLink || `/api/portal/documents/${p.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-stone-100 dark:bg-night-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.webViewLink || `/api/portal/documents/${p.id}`} alt={p.name} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Handover pack */}
              {handoverPack && (
                <div className="border-t border-stone-100 px-4 py-3.5 dark:border-night-line">
                  <a href={handoverPack.webViewLink || `/api/portal/documents/${handoverPack.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <span>📗 Your handover pack &amp; warranty</span>
                    <span aria-hidden>→</span>
                  </a>
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

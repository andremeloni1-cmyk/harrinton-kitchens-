import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission, getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseIds(raw: string): string[] {
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; }
}

// An installer's run sheet for today (P10.2): the installs whose window covers
// today, with everything needed to work the day from a phone — address to
// navigate to, client to call, access/gate notes, and the approved drawings.
export async function GET() {
  const gate = await requirePermission("field_app");
  if (gate instanceof Response) return gate;
  const user = await getSessionUser();

  // An INSTALLER only sees their own jobs (matched to an Installer by email);
  // office/admin see every install on today.
  let myInstallerId: string | null = null;
  if (user?.role === "INSTALLER" && user.email) {
    const inst = await prisma.installer.findFirst({ where: { email: user.email }, select: { id: true } });
    myInstallerId = inst?.id ?? null;
  }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const jobs = await prisma.job.findMany({
    where: {
      pipelineStage: "INSTALL",
      scheduledStart: { lte: todayEnd },
      OR: [{ scheduledEnd: { gte: todayStart } }, { scheduledEnd: null, scheduledStart: { gte: todayStart } }],
    },
    orderBy: { scheduledStart: "asc" },
    select: {
      id: true, reference: true, title: true, address: true,
      clientName: true, clientPhone: true, clientEmail: true,
      scheduledStart: true, scheduledEnd: true,
      installerId: true,
      siteVisits: { where: { type: "INSTALL", status: "scheduled" }, orderBy: { scheduledStart: "desc" }, take: 1, select: { crewIds: true, durationDays: true, notes: true } },
      snags: { where: { status: "open" }, select: { id: true } },
      drawingSets: {
        select: {
          name: true,
          revisions: {
            where: { status: { in: ["released", "approved"] } },
            orderBy: { createdAt: "desc" },
            select: { label: true, status: true, documents: { select: { id: true, name: true, webViewLink: true } } },
          },
        },
      },
    },
  });

  const mine = jobs.filter((j) => {
    if (!myInstallerId) return true;
    const crew = j.siteVisits[0] ? parseIds(j.siteVisits[0].crewIds) : [];
    return j.installerId === myInstallerId || crew.includes(myInstallerId);
  });

  return json({
    scopedToMe: myInstallerId != null,
    jobs: mine.map((j) => {
      const visit = j.siteVisits[0];
      const drawings = j.drawingSets.flatMap((s) =>
        s.revisions.flatMap((r) => r.documents.map((d) => ({
          id: d.id,
          name: d.name || `${s.name} ${r.label}`,
          url: d.webViewLink || `/api/jobs/${j.id}/documents?docId=${d.id}`,
        })))
      );
      return {
        id: j.id,
        reference: j.reference,
        title: j.title,
        clientName: j.clientName,
        clientPhone: j.clientPhone,
        clientEmail: j.clientEmail,
        address: j.address,
        mapsUrl: j.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}` : null,
        start: j.scheduledStart ? j.scheduledStart.toISOString() : null,
        end: j.scheduledEnd ? j.scheduledEnd.toISOString() : null,
        durationDays: visit?.durationDays ?? 1,
        accessNotes: visit?.notes ?? null,
        drawings,
        openSnags: j.snags.length,
      };
    }),
  });
}

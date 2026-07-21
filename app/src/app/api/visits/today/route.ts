import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The signed-in user's site visits (consults / check measures) scheduled for
// today — their personal run sheet on /today.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const visits = await prisma.siteVisit.findMany({
    where: { assigneeId: user.id, status: "scheduled", scheduledStart: { gte: dayStart, lt: dayEnd } },
    orderBy: { scheduledStart: "asc" },
    include: { job: { select: { id: true, title: true, reference: true, address: true, clientName: true, clientPhone: true } } },
  });

  return json({
    visits: visits.map((v) => ({
      id: v.id,
      type: v.type,
      scheduledStart: v.scheduledStart.toISOString(),
      scheduledEnd: v.scheduledEnd ? v.scheduledEnd.toISOString() : null,
      notes: v.notes,
      job: v.job,
    })),
  });
}

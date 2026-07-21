import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { deleteJobEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; visitId: string }> };

// Cancel a consultation: remove its calendar event and mark it cancelled.
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, visitId } = await params;

  const visit = await prisma.siteVisit.findFirst({ where: { id: visitId, jobId: id } });
  if (!visit) return json({ error: "not found" }, 404);

  if (visit.googleEventId) await deleteJobEvent(visit.googleEventId).catch(() => {});
  await prisma.siteVisit.update({ where: { id: visit.id }, data: { status: "cancelled", googleEventId: null } });
  await logActivity(id, "calendar", "Consultation cancelled");
  return json({ ok: true });
}

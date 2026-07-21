import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Update a job's progress at one station: checklist, notes, and the blocker
// flag. Raising a blocker pings the office.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;

  const js = await prisma.jobStation.findUnique({
    where: { id },
    include: { station: { select: { name: true } }, job: { select: { id: true, reference: true, title: true } } },
  });
  if (!js) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("checklist" in body) data.checklist = typeof body.checklist === "string" ? body.checklist : JSON.stringify(body.checklist ?? []);
  if ("notes" in body) data.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  const raisingBlocker = "blocked" in body && Boolean(body.blocked) && !js.blocked;
  if ("blocked" in body) data.blocked = Boolean(body.blocked);
  if ("blockerNote" in body) data.blockerNote = body.blockerNote ? String(body.blockerNote).slice(0, 1000) : null;

  const updated = await prisma.jobStation.update({ where: { id }, data });

  if (raisingBlocker) {
    await logActivity(js.job.id, "note", `Factory blocker at ${js.station.name}: ${updated.blockerNote || "(no detail)"}`);
    await sendPush({
      title: `${BRAND.name} — factory blocker`,
      body: `${js.job.title} blocked at ${js.station.name}`,
      url: `/jobs/${js.job.id}`,
    }).catch(() => {});
  } else if ("blocked" in body && !body.blocked && js.blocked) {
    await logActivity(js.job.id, "note", `Factory blocker cleared at ${js.station.name}`);
  }

  return json({
    jobStation: {
      id: updated.id,
      status: updated.status,
      blocked: updated.blocked,
      blockerNote: updated.blockerNote,
      notes: updated.notes,
      checklist: updated.checklist,
    },
  });
}

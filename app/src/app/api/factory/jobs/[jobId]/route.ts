import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ jobId: string }> };

// Move a job to a station on the board (drag to advance or return). Everything
// before the target becomes done, the target in progress, everything after
// pending.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { jobId } = await params;

  const body = await req.json().catch(() => ({}));
  const toStationId = typeof body.toStationId === "string" ? body.toStationId : "";
  if (!toStationId) return json({ error: "toStationId is required" }, 400);

  const stations = await prisma.jobStation.findMany({
    where: { jobId },
    include: { station: { select: { name: true } } },
  });
  const target = stations.find((s) => s.stationId === toStationId);
  if (!target) return json({ error: "not found" }, 404);

  const now = new Date();
  await Promise.all(
    stations.map((s) => {
      const status = s.position < target.position ? "done" : s.position === target.position ? "in_progress" : "pending";
      return prisma.jobStation.update({
        where: { id: s.id },
        data: {
          status,
          startedAt: status !== "pending" ? s.startedAt ?? now : null,
          completedAt: status === "done" ? s.completedAt ?? now : null,
        },
      });
    })
  );

  await logActivity(jobId, "note", `Factory: moved to ${target.station.name}`);
  return json({ ok: true });
}

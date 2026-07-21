import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { autoScheduleJob } from "@/lib/capacity-server";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

// Auto-propose and persist schedule blocks for a job, packing backward from its
// install date (or an override) across the stations (P9.2).
export async function POST(req: Request) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ error: "Missing job." }, 400);

  try {
    const res = await autoScheduleJob(jobId, {
      dueDate: typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : undefined,
      cabinetCount: typeof body.cabinetCount === "number" ? body.cabinetCount : undefined,
    });
    await logActivity(jobId, "note", `Production scheduled — ${res.count} blocks, due ${res.dueDate}`);
    return json({ ok: true, ...res });
  } catch {
    return json({ error: "Couldn't schedule this job." }, 400);
  }
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { nextRevisionLabel } from "@/lib/drawings";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; setId: string }> };

// Add a new (draft) revision to a set — files are uploaded to it afterwards.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, setId } = await params;

  const set = await prisma.drawingSet.findFirst({
    where: { id: setId, jobId: id },
    include: { _count: { select: { revisions: true } } },
  });
  if (!set) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const label = (typeof body.label === "string" && body.label.trim()) || nextRevisionLabel(set._count.revisions);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

  const revision = await prisma.drawingRevision.create({
    data: { drawingSetId: setId, label, notes },
  });
  await logActivity(id, "note", `Drawing revision ${label} started (${set.name})`);
  return json({ revision: { id: revision.id, label: revision.label, status: revision.status } }, 201);
}

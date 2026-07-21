import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { serializeSnag, createSnagPhoto } from "../route";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; snagId: string }> };

// Resolve (with an optional proof photo) or reopen a snag.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("field_app");
  if (gate instanceof Response) return gate;
  const { id: jobId, snagId } = await params;
  const snag = await prisma.snagItem.findFirst({ where: { id: snagId, jobId } });
  if (!snag) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const status = body.status === "resolved" ? "resolved" : body.status === "open" ? "open" : null;
  if (!status) return json({ error: "Set status to resolved or open." }, 400);

  const data: { status: string; resolvedAt: Date | null; proofDocId?: string | null } = {
    status,
    resolvedAt: status === "resolved" ? new Date() : null,
  };
  if (status === "resolved") {
    const proofDocId = await createSnagPhoto(jobId, body.fileData, body.mimeType);
    if (proofDocId) data.proofDocId = proofDocId;
  } else {
    data.proofDocId = null; // reopening clears the old proof
  }

  const updated = await prisma.snagItem.update({ where: { id: snag.id }, data });
  await logActivity(jobId, "note", status === "resolved" ? `Snag resolved: ${snag.note}` : `Snag reopened: ${snag.note}`);
  return json({ ok: true, snag: serializeSnag(updated) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("field_app");
  if (gate instanceof Response) return gate;
  const { id: jobId, snagId } = await params;
  await prisma.snagItem.deleteMany({ where: { id: snagId, jobId } });
  return json({ ok: true });
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { serializeVariation } from "../route";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; varId: string }> };

// Edit / price a variation, or send it to the client. Approve/decline is a
// portal-only action, so the office can only set draft or sent here.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, varId } = await params;
  const existing = await prisma.variation.findFirst({ where: { id: varId, jobId: id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = (String(body.title).trim().slice(0, 200)) || "Variation";
  if ("description" in body) data.description = body.description ? String(body.description).slice(0, 2000) : null;
  if ("amountCents" in body) data.amountCents = Math.round(Number(body.amountCents) || 0);
  if ("status" in body && (body.status === "draft" || body.status === "sent")) data.status = body.status;

  const v = await prisma.variation.update({ where: { id: varId }, data });
  if (data.status === "sent") await logActivity(id, "note", `Variation "${v.title}" sent to the client (${(v.amountCents / 100).toFixed(2)})`);
  return json({ variation: serializeVariation(v) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, varId } = await params;
  const existing = await prisma.variation.findFirst({ where: { id: varId, jobId: id } });
  if (!existing) return json({ error: "not found" }, 404);
  if (existing.status === "approved") return json({ error: "An approved variation can't be deleted." }, 400);
  await prisma.variation.delete({ where: { id: varId } });
  return json({ ok: true });
}

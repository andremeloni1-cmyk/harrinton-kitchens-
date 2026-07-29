import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ ruleId: string }> };

const NUMERIC_BANDS = [
  "minCabinetWidthMm",
  "maxCabinetWidthMm",
  "minCabinetDepthMm",
  "maxCabinetDepthMm",
  "minCabinetHeightMm",
  "maxCabinetHeightMm",
  "minPanelLengthMm",
  "maxPanelLengthMm",
  "minPanelWidthMm",
  "maxPanelWidthMm",
] as const;

function band(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Update a rule. Fields absent from the body are left alone, so the rules list
 * can toggle `active` or nudge `position` without resending every band and
 * accidentally clearing one it never displayed.
 */
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const ruleId = (await params).ruleId;

  const existing = await prisma.hardwareRule.findUnique({ where: { id: ruleId }, select: { id: true } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 120) || undefined;
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.position !== undefined && Number.isFinite(Number(body.position))) data.position = Math.trunc(Number(body.position));
  if (typeof body.cabinetType === "string") data.cabinetType = body.cabinetType.trim().slice(0, 120);
  if (typeof body.panelCode === "string") data.panelCode = body.panelCode.trim().slice(0, 120);
  if (typeof body.notes === "string") data.notes = body.notes.trim().slice(0, 500);
  if (body.qtyPer !== undefined) {
    const qty = Number(body.qtyPer);
    if (Number.isFinite(qty) && qty > 0) data.qtyPer = qty;
  }
  if (typeof body.hardwareItemId === "string" && body.hardwareItemId) {
    const item = await prisma.hardwareItem.findUnique({ where: { id: body.hardwareItemId }, select: { id: true } });
    if (!item) return json({ error: "That hardware line doesn't exist." }, 400);
    data.hardwareItemId = body.hardwareItemId;
  }
  // A band sent as null or "" clears it — that is how you widen a rule.
  for (const key of NUMERIC_BANDS) {
    if (key in body) data[key] = band(body[key]);
  }

  const rule = await prisma.hardwareRule.update({
    where: { id: ruleId },
    data,
    include: { hardwareItem: { select: { id: true, code: true, name: true, unit: true, piecesPerPack: true } } },
  });
  return json({ rule });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const ruleId = (await params).ruleId;
  const existing = await prisma.hardwareRule.findUnique({ where: { id: ruleId }, select: { id: true } });
  if (!existing) return json({ error: "not found" }, 404);
  await prisma.hardwareRule.delete({ where: { id: ruleId } });
  return json({ ok: true });
}

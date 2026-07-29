import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

// Every editable field on a rule, with how to read it off a JSON body. Kept as
// one list so create and update can't drift into accepting different fields.
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

function readRule(body: Record<string, unknown>) {
  const bands: Record<string, number | null> = {};
  for (const key of NUMERIC_BANDS) bands[key] = band(body[key]);

  const qty = Number(body.qtyPer);
  return {
    name: typeof body.name === "string" ? body.name.trim().slice(0, 120) : "",
    active: body.active !== false,
    position: Number.isFinite(Number(body.position)) ? Math.trunc(Number(body.position)) : 0,
    cabinetType: typeof body.cabinetType === "string" ? body.cabinetType.trim().slice(0, 120) : "",
    panelCode: typeof body.panelCode === "string" ? body.panelCode.trim().slice(0, 120) : "",
    // A rule producing nothing is a rule that silently does nothing; one is the
    // only sane floor.
    qtyPer: Number.isFinite(qty) && qty > 0 ? qty : 1,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "",
    ...bands,
  };
}

/** Every rule, with the stock line each one produces. */
export async function GET() {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const rules = await prisma.hardwareRule.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { hardwareItem: { select: { id: true, code: true, name: true, unit: true, piecesPerPack: true } } },
  });
  return json({ rules });
}

export async function POST(req: Request) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const hardwareItemId = typeof body.hardwareItemId === "string" ? body.hardwareItemId : "";
  if (!hardwareItemId) return json({ error: "Pick the hardware this rule produces." }, 400);

  const item = await prisma.hardwareItem.findUnique({ where: { id: hardwareItemId }, select: { id: true, name: true } });
  if (!item) return json({ error: "That hardware line doesn't exist." }, 400);

  const data = readRule(body);
  const rule = await prisma.hardwareRule.create({
    data: {
      ...data,
      // An unnamed rule is unreadable in a list of thirty; fall back to what it
      // produces rather than showing a blank row.
      name: data.name || `Hardware — ${item.name}`,
      hardwareItemId,
    },
    include: { hardwareItem: { select: { id: true, code: true, name: true, unit: true, piecesPerPack: true } } },
  });
  return json({ rule }, 201);
}

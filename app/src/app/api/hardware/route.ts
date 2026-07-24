import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Next free label code, e.g. HW-1013 (highest existing number + 1). */
async function nextCode(): Promise<string> {
  const all = await prisma.hardwareItem.findMany({ select: { code: true } });
  let max = 1000;
  for (const i of all) {
    const m = i.code?.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `HW-${max + 1}`;
}

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (code) {
    const item = await prisma.hardwareItem.findUnique({
      where: { code },
      include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
    });
    if (!item) return json({ error: "not found" }, 404);
    return json({ item });
  }
  const items = await prisma.hardwareItem.findMany({
    orderBy: [{ name: "asc" }],
    include: { events: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  return json({ items });
}

export async function POST(req: Request) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "name is required" }, 400);

  // Retry on a code clash (two concurrent creates picking the same HW-N).
  for (let attempt = 0; ; attempt++) {
    try {
      const item = await prisma.hardwareItem.create({
        data: {
          code: await nextCode(),
          name,
          category: body.category?.trim() || null,
          supplier: body.supplier?.trim() || null,
          unit: body.unit?.trim() || "box",
          packSize: body.packSize?.trim() || null,
          qtyOnHand: Number.isFinite(Number(body.qtyOnHand)) ? Math.max(0, Math.round(Number(body.qtyOnHand))) : 0,
          reorderLevel: Number.isFinite(Number(body.reorderLevel)) ? Math.max(0, Math.round(Number(body.reorderLevel))) : 1,
          location: body.location?.trim() || null,
          notes: body.notes?.trim() || null,
        },
      });
      return json({ item }, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
}

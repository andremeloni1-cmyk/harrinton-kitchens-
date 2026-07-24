import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

// Chip colours cycled through for new installers (teal-adjacent, distinct).
const COLORS = ["#0d9488", "#0369a1", "#b45309", "#7c3aed", "#be185d", "#4d7c0f"];

export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const installers = await prisma.installer.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      // Active workload — enough for the management list without a heavy payload.
      jobs: {
        where: { status: { in: ["accepted", "scheduled", "in_progress"] } },
        select: { id: true, title: true, status: true, scheduledStart: true, scheduledEnd: true, durationMins: true, address: true },
        orderBy: { scheduledStart: "asc" },
      },
      _count: { select: { jobs: true, reports: true } },
    },
  });
  return json({ installers });
}

export async function POST(req: Request) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return json({ error: "name is required" }, 400);
  }
  const count = await prisma.installer.count();
  const installer = await prisma.installer.create({
    data: {
      name: body.name.trim(),
      role: body.role?.trim() || "Installer",
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      color: body.color || COLORS[count % COLORS.length],
      notes: body.notes?.trim() || null,
    },
  });
  return json({ installer }, 201);
}

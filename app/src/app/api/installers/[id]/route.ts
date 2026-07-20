import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const installer = await prisma.installer.findUnique({
    where: { id: (await params).id },
    include: {
      jobs: { orderBy: { scheduledStart: "asc" } },
      reports: { orderBy: { updatedAt: "desc" }, take: 10 },
    },
  });
  if (!installer) return json({ error: "not found" }, 404);
  return json({ installer });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const existing = await prisma.installer.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of ["name", "role", "email", "phone", "color", "notes"]) {
    if (f in body) data[f] = typeof body[f] === "string" ? body[f].trim() || null : body[f];
  }
  // Name and role must stay set — fall back to what's there.
  if ("name" in data && !data.name) data.name = existing.name;
  if ("role" in data && !data.role) data.role = "Installer";
  if ("active" in body) data.active = Boolean(body.active);

  const installer = await prisma.installer.update({ where: { id }, data });
  return json({ installer });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const existing = await prisma.installer.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);
  // Jobs/reports keep existing (installerId set to null by the relation).
  await prisma.installer.delete({ where: { id } });
  return json({ ok: true });
}

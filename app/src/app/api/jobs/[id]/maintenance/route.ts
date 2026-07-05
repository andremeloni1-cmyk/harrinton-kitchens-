import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { RETURN_TRIP_MAINTENANCE } from "@/lib/report-templates";
import type { ChecklistItem } from "@/lib/pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseItems(raw: string): ChecklistItem[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((i) => i && typeof i.label === "string")
        .map((i) => ({ label: String(i.label), done: Boolean(i.done) }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function sanitize(body: unknown): ChecklistItem[] {
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => ({ label: String((i as ChecklistItem).label || "").trim(), done: Boolean((i as ChecklistItem).done) }))
    .filter((i) => i.label);
}

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);
  return json({ maintenance: parseItems(job.maintenanceTasks) });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const body = await req.json().catch(() => ({}));
  const items = sanitize(body);
  try {
    const job = await prisma.job.update({
      where: { id },
      data: { maintenanceTasks: JSON.stringify(items) },
    });
    return json({ maintenance: parseItems(job.maintenanceTasks) });
  } catch {
    return json({ error: "not found" }, 404); // deleted job → let offline queue drop it
  }
}

/** Seed the standard return-trip maintenance checklist, appending any items not
 * already present. */
export async function POST(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  const existing = parseItems(job.maintenanceTasks);
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));
  const merged = [
    ...existing,
    ...RETURN_TRIP_MAINTENANCE.filter((l) => !seen.has(l.toLowerCase())).map((label) => ({ label, done: false })),
  ];
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { maintenanceTasks: JSON.stringify(merged) },
  });
  return json({ maintenance: parseItems(updated.maintenanceTasks) });
}

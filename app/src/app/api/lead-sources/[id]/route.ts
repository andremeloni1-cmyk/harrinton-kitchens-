import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("enabled" in body) data.enabled = Boolean(body.enabled);
  if ("name" in body) data.name = body.name;
  if ("displayName" in body) data.displayName = body.displayName || null;
  // Per-company email overrides: store as a JSON string, or clear with null.
  if ("templates" in body) {
    data.templates =
      body.templates == null ? null : typeof body.templates === "string" ? body.templates : JSON.stringify(body.templates);
  }
  try {
    const source = await prisma.leadSource.update({ where: { id: (await params).id }, data });
    return json({ source });
  } catch {
    return json({ error: "not found" }, 404);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  try {
    await prisma.leadSource.delete({ where: { id: (await params).id } });
    return json({ ok: true });
  } catch {
    return json({ error: "not found" }, 404);
  }
}

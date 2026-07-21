import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import type { Variation } from "@prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export function serializeVariation(v: Variation) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    amountCents: v.amountCents,
    status: v.status,
    source: v.source,
    createdAt: v.createdAt.toISOString(),
  };
}

export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const variations = await prisma.variation.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } });
  return json({ variations: variations.map(serializeVariation) });
}

// Draft a variation (priced later, then sent for portal approval).
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const title = (typeof body.title === "string" && body.title.trim().slice(0, 200)) || "Variation";
  const description = body.description ? String(body.description).slice(0, 2000) : null;
  const amountCents = Number.isFinite(Number(body.amountCents)) ? Math.round(Number(body.amountCents)) : 0;

  const v = await prisma.variation.create({ data: { jobId, title, description, amountCents, source: "manual" } });
  await logActivity(jobId, "note", `Variation "${title}" drafted`);
  return json({ variation: serializeVariation(v) }, 201);
}

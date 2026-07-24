import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { draftReport } from "@/lib/report-ai";
import { visionConfigured } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;

  if (!visionConfigured()) {
    return json({ ok: false, message: "Add ANTHROPIC_API_KEY on the server to enable AI auto-fill." });
  }

  const job = await prisma.job.findUnique({
    where: { id: (await params).id },
    include: { documents: true },
  });
  if (!job) return json({ error: "not found" }, 404);

  const data = await draftReport({
    title: job.title,
    description: job.description,
    address: job.address,
    clientName: job.clientName,
    documents: job.documents.map((d) => d.name),
  });

  if (!data) return json({ ok: false, message: "Couldn't draft the report just now — try again in a moment." });
  return json({ ok: true, data });
}

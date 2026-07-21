import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { suggestReply } from "@/lib/message-ai";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// AI-drafted office reply suggestion (P11.3). Returns a draft for the human to
// edit and send — it never sends anything. Null (unavailable) when AI is off.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const [job, messages] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { title: true, clientName: true } }),
    prisma.portalMessage.findMany({ where: { jobId }, orderBy: { createdAt: "asc" }, select: { sender: true, body: true } }),
  ]);
  if (!job) return json({ error: "not found" }, 404);

  const draft = await suggestReply({ jobTitle: job.title, clientName: job.clientName, thread: messages });
  return json({ draft, unavailable: draft === null });
}

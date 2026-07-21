import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// The client's drawing revisions that are out for review or already approved.
export async function GET() {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const revisions = await prisma.drawingRevision.findMany({
    where: { status: { in: ["sent", "approved"] }, drawingSet: { job: { clientId: portal.id } } },
    orderBy: { createdAt: "desc" },
    include: {
      drawingSet: { include: { job: { select: { id: true, title: true, reference: true } } } },
      documents: { select: { id: true, name: true, mimeType: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });

  return json({
    revisions: revisions.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      summaryClient: r.summaryClient,
      setName: r.drawingSet.name,
      job: r.drawingSet.job,
      documents: r.documents.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })),
      comments: r.comments.map((c) => ({
        authorType: c.authorType, authorName: c.authorName, body: c.body, createdAt: c.createdAt.toISOString(),
      })),
    })),
  });
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; revId: string }> };

// Staff reply on a drawing revision's review thread.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, revId } = await params;

  const rev = await prisma.drawingRevision.findFirst({ where: { id: revId, drawingSet: { jobId: id } } });
  if (!rev) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim().slice(0, 2000);
  if (!text) return json({ error: "Comment can’t be empty." }, 400);

  const comment = await prisma.drawingComment.create({
    data: { revisionId: revId, authorType: "staff", authorName: gate.name || "Office", body: text },
  });
  return json({ comment: { id: comment.id, authorType: "staff", authorName: comment.authorName, body: comment.body, createdAt: comment.createdAt.toISOString() } }, 201);
}

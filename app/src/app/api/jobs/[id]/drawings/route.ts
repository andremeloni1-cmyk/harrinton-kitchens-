import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

type RevWithDocs = {
  id: string; label: string; status: string; summary: string | null; summaryClient: string | null;
  notes: string | null; sentAt: Date | null; approvedAt: Date | null; releasedAt: Date | null; createdAt: Date;
  documents: { id: string; name: string; mimeType: string; webViewLink: string | null }[];
  comments?: { id: string; authorType: string; authorName: string; body: string; createdAt: Date }[];
};

export function serializeSet(s: { id: string; name: string; createdAt: Date; revisions: RevWithDocs[] }) {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.createdAt.toISOString(),
    revisions: s.revisions.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      summary: r.summary,
      summaryClient: r.summaryClient,
      notes: r.notes,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      releasedAt: r.releasedAt ? r.releasedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      documents: r.documents.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, webViewLink: d.webViewLink })),
      comments: (r.comments ?? []).map((c) => ({
        id: c.id, authorType: c.authorType, authorName: c.authorName, body: c.body, createdAt: c.createdAt.toISOString(),
      })),
    })),
  };
}

// The full drawings tree for a job: sets → revisions (chronological) → files.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const sets = await prisma.drawingSet.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
    include: {
      revisions: {
        orderBy: { createdAt: "asc" },
        include: {
          documents: { select: { id: true, name: true, mimeType: true, webViewLink: true } },
          comments: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  return json({ sets: sets.map(serializeSet) });
}

// Create a drawing set (e.g. "Kitchen plans").
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);
  const body = await req.json().catch(() => ({}));
  const name = (typeof body.name === "string" && body.name.trim()) || "Drawings";
  const set = await prisma.drawingSet.create({ data: { jobId, name } });
  return json({ set: serializeSet({ ...set, revisions: [] }) }, 201);
}

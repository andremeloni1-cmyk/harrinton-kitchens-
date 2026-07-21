import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission, getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import type { SnagItem } from "@prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const MAX_B64 = 15 * 1024 * 1024;

export function serializeSnag(s: SnagItem) {
  return {
    id: s.id,
    note: s.note,
    status: s.status,
    assigneeName: s.assigneeName,
    raisedByName: s.raisedByName,
    photoUrl: s.photoDocId ? `/api/jobs/${s.jobId}/documents?docId=${s.photoDocId}` : null,
    proofUrl: s.proofDocId ? `/api/jobs/${s.jobId}/documents?docId=${s.proofDocId}` : null,
    createdAt: s.createdAt.toISOString(),
    resolvedAt: s.resolvedAt ? s.resolvedAt.toISOString() : null,
  };
}

// Store an inline snag photo as a job Document (works with or without Drive).
export async function createSnagPhoto(jobId: string, fileData: unknown, mimeType: unknown): Promise<string | null> {
  if (typeof fileData !== "string" || !fileData || fileData.length > MAX_B64) return null;
  const doc = await prisma.document.create({
    data: { jobId, name: "Snag photo", source: "snag", mimeType: typeof mimeType === "string" && mimeType ? mimeType : "image/jpeg", fileData },
  });
  return doc.id;
}

// A job's snags — the office tracker and the field both read this.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("view");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const snags = await prisma.snagItem.findMany({ where: { jobId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return json({ snags: snags.map(serializeSnag) });
}

// Raise a snag (from the field or the office): note + optional photo + assignee.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("field_app");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);
  const user = await getSessionUser();

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!note) return json({ error: "Describe the snag." }, 400);

  let assigneeName: string | null = null;
  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  if (assigneeId) {
    const inst = await prisma.installer.findUnique({ where: { id: assigneeId }, select: { name: true } });
    assigneeName = inst?.name ?? null;
  }
  const photoDocId = await createSnagPhoto(jobId, body.fileData, body.mimeType);

  const snag = await prisma.snagItem.create({
    data: { jobId, note, assigneeId, assigneeName, photoDocId, raisedByName: user?.name ?? null },
  });
  await logActivity(jobId, "note", `Snag raised: ${note}${assigneeName ? ` · ${assigneeName}` : ""}`);
  return json({ ok: true, snag: serializeSnag(snag) }, 201);
}

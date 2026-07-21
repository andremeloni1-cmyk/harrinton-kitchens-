import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { isRevisionLocked } from "@/lib/drawings";
import { uploadToJobFolder } from "@/lib/google/drive";
import { isGoogleConnected } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; revId: string }> };

const MAX_B64 = 15 * 1024 * 1024; // ≈11 MB file

async function revisionForJob(id: string, revId: string) {
  return prisma.drawingRevision.findFirst({ where: { id: revId, drawingSet: { jobId: id } } });
}

// Add a drawing file (base64) to a revision. Files to Google Drive when
// connected; always stores inline bytes so the portal can serve it. Blocked once
// the revision is approved/released — a change needs a new revision.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, revId } = await params;

  const rev = await revisionForJob(id, revId);
  if (!rev) return json({ error: "not found" }, 404);
  if (isRevisionLocked(rev.status)) {
    return json({ error: "This revision is locked — create a new revision to change the drawings." }, 400);
  }
  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, reference: true, title: true, driveFolderId: true },
  });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fileData = typeof body.fileData === "string" ? body.fileData : "";
  const mimeType = (typeof body.mimeType === "string" && body.mimeType) || "application/pdf";
  if (!name || !fileData) return json({ error: "name and fileData are required" }, 400);
  if (fileData.length > MAX_B64) return json({ error: "File is too large (11 MB max)." }, 400);

  let driveFileId: string | null = null;
  let webViewLink: string | null = null;
  if (await isGoogleConnected()) {
    const up = await uploadToJobFolder(job, name, Buffer.from(fileData, "base64"), mimeType).catch(() => null);
    if (up) {
      driveFileId = up.fileId;
      webViewLink = up.webViewLink;
    }
  }

  const doc = await prisma.document.create({
    data: { jobId: id, drawingRevisionId: revId, name, source: "drawing", mimeType, fileData, driveFileId, webViewLink },
  });
  await logActivity(id, "drive", `Drawing "${name}" added to ${rev.label}${webViewLink ? " (filed to Drive)" : ""}`);
  return json({ document: { id: doc.id, name: doc.name, mimeType: doc.mimeType, webViewLink: doc.webViewLink } }, 201);
}

export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, revId } = await params;

  const rev = await revisionForJob(id, revId);
  if (!rev) return json({ error: "not found" }, 404);
  if (isRevisionLocked(rev.status)) {
    return json({ error: "This revision is locked." }, 400);
  }
  const docId = new URL(req.url).searchParams.get("docId") || "";
  const doc = await prisma.document.findFirst({ where: { id: docId, drawingRevisionId: revId } });
  if (!doc) return json({ error: "not found" }, 404);
  await prisma.document.delete({ where: { id: doc.id } });
  return json({ ok: true });
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { documentServingHeaders } from "@/lib/document-serving";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ~15 MB of base64 (≈11 MB file) — generous for kitchen plan PDFs.
const MAX_B64_LENGTH = 15 * 1024 * 1024;

// Upload a plan (PDF/image) for the client to review on their portal.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fileData = typeof body.fileData === "string" ? body.fileData : "";
  if (!name || !fileData) return json({ error: "name and fileData are required" }, 400);
  if (fileData.length > MAX_B64_LENGTH) return json({ error: "file is too large (11 MB max)" }, 400);

  const document = await prisma.document.create({
    data: {
      jobId: job.id,
      name,
      source: "plan",
      mimeType: typeof body.mimeType === "string" && body.mimeType ? body.mimeType : "application/pdf",
      fileData,
      sharedWithClient: true,
      reviewStatus: "pending",
    },
  });
  await logActivity(job.id, "note", `Plan "${name}" shared with the client for review.`).catch(() => {});
  return json({ document: { ...document, fileData: undefined } }, 201);
}

// Stream an uploaded plan back to the (authenticated) dashboard for preview.
export async function GET(req: Request, { params }: Params) {
  const gate = await requirePermission("view");
  if (gate instanceof Response) return gate;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId") || "";
  const doc = await prisma.document.findFirst({ where: { id: docId, jobId: (await params).id } });
  if (!doc || !doc.fileData) return json({ error: "not found" }, 404);
  return new Response(Buffer.from(doc.fileData, "base64"), {
    headers: documentServingHeaders(doc.mimeType, doc.name),
  });
}

// Toggle whether a document (e.g. a progress photo) is visible on the client
// portal (P11.1). Staff curate — nothing is auto-shared.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const docId = typeof body.docId === "string" ? body.docId : "";
  const doc = await prisma.document.findFirst({ where: { id: docId, jobId: (await params).id } });
  if (!doc) return json({ error: "not found" }, 404);
  const sharedWithClient = Boolean(body.sharedWithClient);
  await prisma.document.update({ where: { id: doc.id }, data: { sharedWithClient } });
  return json({ ok: true, sharedWithClient });
}

export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId") || "";
  const doc = await prisma.document.findFirst({ where: { id: docId, jobId: (await params).id } });
  if (!doc) return json({ error: "not found" }, 404);
  await prisma.document.delete({ where: { id: doc.id } });
  return json({ ok: true });
}

import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { MUDMAP_SOURCE, isMudmapMime } from "@/lib/design-docs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ~8 MB of base64 (≈6 MB image) — a phone photo of a sketch, not a plan set.
const MAX_B64_LENGTH = 8 * 1024 * 1024;

/** List a job's mudmaps. Bodies stay out of the response — this is an index. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const documents = await prisma.document.findMany({
    where: { jobId: (await params).id, source: MUDMAP_SOURCE },
    select: { id: true, name: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ mudmaps: documents });
}

/**
 * Upload a photographed sketch. Stored unshared: a mudmap is a working
 * document, and the client portal only ever shows the finished drawing set.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Mudmap";
  const fileData = typeof body.fileData === "string" ? body.fileData : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  if (!fileData) return json({ error: "fileData is required" }, 400);
  if (fileData.length > MAX_B64_LENGTH) return json({ error: "image is too large (6 MB max)" }, 400);
  if (!isMudmapMime(mimeType)) return json({ error: "a mudmap must be a photo or image" }, 400);

  const document = await prisma.document.create({
    data: { jobId, name, source: MUDMAP_SOURCE, mimeType, fileData, sharedWithClient: false },
    select: { id: true, name: true, mimeType: true, createdAt: true },
  });
  return json({ mudmap: document }, 201);
}

export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId") || "";
  const doc = await prisma.document.findFirst({
    where: { id: docId, jobId: (await params).id, source: MUDMAP_SOURCE },
    select: { id: true },
  });
  if (!doc) return json({ error: "not found" }, 404);
  await prisma.document.delete({ where: { id: doc.id } });
  return json({ ok: true });
}

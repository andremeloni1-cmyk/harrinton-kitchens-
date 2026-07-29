import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { MEASURE_PHOTO_SOURCE, isMudmapMime } from "@/lib/design-docs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ~8 MB of base64 (≈6 MB image) — a phone photo of a wall, matching the mudmap
// limit. The capture form downscales before it gets here.
const MAX_B64_LENGTH = 8 * 1024 * 1024;

/**
 * The job's check-measure photos. Bodies stay out of the response — this is an
 * index; the room's photoIds pick out which of these belong where, and the
 * bytes come back one at a time through the documents endpoint.
 */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const photos = await prisma.document.findMany({
    where: { jobId: (await params).id, source: MEASURE_PHOTO_SOURCE },
    select: { id: true, name: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return json({ photos });
}

/**
 * Attach a photo to the check measure. Stored unshared: a photo of an open
 * wall cavity is a working record for the designer and the installer, not
 * something to hand a homeowner.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : "Site photo";
  const fileData = typeof body.fileData === "string" ? body.fileData : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  if (!fileData) return json({ error: "fileData is required" }, 400);
  if (fileData.length > MAX_B64_LENGTH) return json({ error: "image is too large (6 MB max)" }, 400);
  if (!isMudmapMime(mimeType)) return json({ error: "a site photo must be a photo or image" }, 400);

  const photo = await prisma.document.create({
    data: { jobId, name, source: MEASURE_PHOTO_SOURCE, mimeType, fileData, sharedWithClient: false },
    select: { id: true, name: true, mimeType: true, createdAt: true },
  });
  return json({ photo }, 201);
}

/**
 * Detach a photo. The room's photoIds are saved by the form's own debounced
 * save, so the document row goes here and the reference goes with it — an id
 * left behind in the JSON would render as a broken thumbnail.
 */
export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId") || "";
  const doc = await prisma.document.findFirst({
    where: { id: docId, jobId: (await params).id, source: MEASURE_PHOTO_SOURCE },
    select: { id: true },
  });
  if (!doc) return json({ error: "not found" }, 404);
  await prisma.document.delete({ where: { id: doc.id } });
  return json({ ok: true });
}

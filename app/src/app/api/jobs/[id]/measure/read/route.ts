import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { readSiteSheet } from "@/lib/measure-ai";
import { sniffImageType } from "@/lib/enquiry";
import { visionConfigured } from "@/lib/vision";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const MAX_FILES = 4;
const MAX_BYTES = 15 * 1024 * 1024;

// Read a photographed site sheet into structured rooms (P5.3). Returns the rooms
// for review — the form merges them on the user's say-so; nothing auto-commits.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  if (!visionConfigured()) {
    return json({ rooms: null, message: "AI reading isn’t available — add ANTHROPIC_API_KEY on the server." });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Invalid upload." }, 400);

  const files = form.getAll("photos").filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  const images: { data: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) continue;
    const data = Buffer.from(await f.arrayBuffer());
    const mimeType = sniffImageType(data);
    if (!mimeType) continue;
    images.push({ data, mimeType });
  }
  if (images.length === 0) return json({ error: "Add a clear photo of the site sheet." }, 400);

  const rooms = await readSiteSheet(images);
  if (!rooms) {
    return json({
      rooms: null,
      message: "Couldn’t read that sheet — try a clearer, well-lit photo, or enter the rooms by hand.",
    });
  }
  return json({ rooms });
}

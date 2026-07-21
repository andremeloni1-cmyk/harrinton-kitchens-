import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { visionConfigured } from "@/lib/vision";
import { sniffImageType } from "@/lib/enquiry";
import { extractCutList, type CutListFile } from "@/lib/cutlist-ai";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

function isPdf(b: Buffer): boolean {
  return b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-";
}

// Extract a cut list from an uploaded CAD job PDF (or images) for review.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  if (!visionConfigured()) {
    return json({ cutlist: null, message: "AI extraction isn’t available — add ANTHROPIC_API_KEY on the server, or enter the parts by hand." });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Invalid upload." }, 400);

  const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  const cutFiles: CutListFile[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    const mimeType = isPdf(buf) ? "application/pdf" : sniffImageType(buf);
    if (!mimeType) continue;
    cutFiles.push({ data: buf.toString("base64"), mimeType });
  }
  if (cutFiles.length === 0) return json({ error: "Upload a cut-list PDF (or a clear photo of one)." }, 400);

  const settings = await prisma.companySettings.findFirst();
  const cutlist = await extractCutList(cutFiles, settings?.extractionHint || undefined);
  if (!cutlist) {
    return json({ cutlist: null, message: "Couldn’t read a cut list from that file — try a clearer export, or enter the parts by hand." });
  }
  return json({ cutlist });
}

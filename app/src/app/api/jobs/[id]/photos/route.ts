import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { isGoogleConnected } from "@/lib/google/oauth";
import { uploadPhotosToJobFolder } from "@/lib/google/drive";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

// The client uploads in small chunks, but accept a generous per-request count
// so a manual/bulk post still works without silently dropping photos.
const MAX_FILES = 50;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB (downscaled photos are far smaller)
const MAX_BYTES_TOTAL = 60 * 1024 * 1024; // don't buffer more than this per request

// Verify real image magic bytes rather than trusting the client's MIME. Returns
// the sniffed content-type, or null if the bytes aren't a supported image.
function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  // HEIC/HEIF: 'ftyp' box with a heic/heif/mif1 brand.
  if (b.toString("ascii", 4, 8) === "ftyp" && /heic|heif|mif1|hevc/.test(b.toString("ascii", 8, 20))) return "image/heic";
  return null;
}

// Upload site photos straight from the dashboard into the job's shared
// "Photos (client)" Drive folder, and record them as documents. Returns the
// shareable folder link so the UI can offer it to the client.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  if (!(await isGoogleConnected())) {
    return json({ ok: false, connected: false, saved: 0, message: "Connect Google in Settings to upload photos to Drive." });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "invalid upload" }, 400);

  const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  const images: { name: string; data: Buffer; mimeType: string }[] = [];
  let totalBytes = 0;
  for (const f of files) {
    if (f.size > MAX_BYTES_PER_FILE) continue; // skip oversized files (don't buffer them)
    totalBytes += f.size;
    if (totalBytes > MAX_BYTES_TOTAL) break; // stop before over-committing memory
    const data = Buffer.from(await f.arrayBuffer());
    // Trust the bytes, not the client's declared MIME.
    const sniffed = sniffImage(data);
    if (!sniffed) continue;
    // Sanitise the stored filename: strip any path and keep it simple.
    const base = (f.name || "photo").split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    images.push({ name: base || `photo-${images.length + 1}.jpg`, data, mimeType: sniffed });
  }
  if (images.length === 0) {
    return json({ ok: false, saved: 0, message: "No valid image files found in the upload." });
  }

  const res = await uploadPhotosToJobFolder(job, images);
  if (!res) return json({ ok: false, connected: false, saved: 0, message: "Couldn't reach Google Drive just now." });

  for (const u of res.uploaded) {
    // Skip if this Drive file is already recorded (idempotent on retry).
    const exists = await prisma.document.findFirst({ where: { jobId: job.id, driveFileId: u.fileId } });
    if (exists) continue;
    await prisma.document.create({
      data: {
        jobId: job.id,
        name: u.name,
        driveFileId: u.fileId,
        webViewLink: u.webViewLink,
        source: "upload",
        mimeType: u.mimeType,
      },
    });
  }
  await logActivity(job.id, "drive", `Uploaded ${res.uploaded.length} photo(s) to the client photos folder`);
  if (!res.shared) {
    await logActivity(
      job.id,
      "drive",
      "Photos folder could not be made public — your Google account may block 'anyone with link' sharing. Clients won't be able to open the link."
    );
  }

  return json({ ok: true, connected: true, saved: res.uploaded.length, folderLink: res.folderLink, shared: res.shared });
}

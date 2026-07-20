import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { isGoogleConnected } from "@/lib/google/oauth";
import { getMessageImages } from "@/lib/google/gmail";
import { analyzeJobImages, visionConfigured } from "@/lib/vision";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);

  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  if (!visionConfigured()) {
    return json({ ok: false, message: "Add ANTHROPIC_API_KEY on the server to enable AI image reading." });
  }
  if (!job.gmailMessageId) {
    return json({ ok: false, message: "This job wasn't imported from an email, so there are no source images to re-read." });
  }
  if (!(await isGoogleConnected())) {
    return json({ ok: false, message: "Connect Google to fetch the original email images." });
  }

  const images = await getMessageImages(job.gmailMessageId);
  if (images.length === 0) {
    return json({ ok: false, message: "No image attachments found on the original email." });
  }

  const read = await analyzeJobImages(
    images.map((a) => ({ filename: a.filename, data: a.data, mimeType: a.mimeType }))
  );
  if (!read) {
    return json({ ok: false, message: "Couldn't read the images just now — try again in a moment." });
  }

  // Keep the original email text if it was preserved under the "— Email —" marker.
  const emailPart = job.description?.split("— Email —")[1];
  const description = [read.description, emailPart && `— Email —${emailPart}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { description, ...(read.title ? { title: read.title } : {}) },
  });

  await logActivity(job.id, "lead", `Re-read ${images.length} image(s) with AI`);
  return json({ ok: true, images: images.length, job: updated });
}

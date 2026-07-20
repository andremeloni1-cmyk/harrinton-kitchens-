import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { dedupeJobFolders } from "@/lib/google/drive";

export const dynamic = "force-dynamic";

// One-time cleanup of duplicate files already in Drive, plus duplicate document
// rows (same job + filename), keeping the most recent of each.
export async function POST() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);

  const drive = await dedupeJobFolders();

  let docsRemoved = 0;
  const jobs = await prisma.job.findMany({ select: { id: true } });
  for (const job of jobs) {
    const docs = await prisma.document.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" } });
    const seen = new Set<string>();
    for (const d of docs) {
      if (seen.has(d.name)) {
        await prisma.document.delete({ where: { id: d.id } }).catch(() => {});
        docsRemoved++;
      } else {
        seen.add(d.name);
      }
    }
  }

  return json({ ok: true, foldersScanned: drive.scanned, filesRemoved: drive.removed, docsRemoved });
}

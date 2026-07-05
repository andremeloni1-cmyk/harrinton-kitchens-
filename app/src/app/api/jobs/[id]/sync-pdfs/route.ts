import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { syncJobPdfs } from "@/lib/automations";
import { isGoogleConnected } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  if (!(await isGoogleConnected())) {
    return json({ ok: false, connected: false, saved: 0, message: "Connect Google to search email for PDFs." });
  }

  const saved = await syncJobPdfs(job);
  return json({ ok: true, connected: true, saved });
}

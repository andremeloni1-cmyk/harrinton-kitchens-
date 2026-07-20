import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Serve a shared plan to the client portal. Only documents explicitly shared
// with the client are reachable, and the client id must match the job's.
export async function GET(req: Request, { params }: Params) {
  const doc = await prisma.document.findUnique({
    where: { id: (await params).id },
    include: { job: { select: { clientId: true } } },
  });
  const clientId = new URL(req.url).searchParams.get("client") || "";
  if (!doc || !doc.sharedWithClient || !doc.fileData || !doc.job.clientId || doc.job.clientId !== clientId) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = Buffer.from(doc.fileData, "base64");
  return new Response(bytes, {
    headers: {
      "content-type": doc.mimeType || "application/pdf",
      "content-disposition": `inline; filename="${doc.name.replace(/[^\w.\- ]/g, "_")}"`,
      "cache-control": "no-store",
    },
  });
}

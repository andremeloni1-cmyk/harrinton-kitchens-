import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// Stream a drawing file inline to the signed-in client — scoped to a revision on
// one of their own jobs.
export async function GET(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const docId = new URL(req.url).searchParams.get("docId") || "";

  const doc = await prisma.document.findFirst({
    where: { id: docId, drawingRevision: { drawingSet: { job: { clientId: portal.id } } } },
  });
  if (!doc || !doc.fileData) return json({ error: "not found" }, 404);

  return new Response(Buffer.from(doc.fileData, "base64"), {
    headers: {
      "content-type": doc.mimeType || "application/pdf",
      "content-disposition": `inline; filename="${doc.name.replace(/[^\w.\- ]/g, "_")}"`,
      "cache-control": "no-store",
    },
  });
}

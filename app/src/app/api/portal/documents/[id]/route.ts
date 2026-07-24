import { prisma } from "@/lib/db";
import { getPortalClient } from "@/lib/portal-session";
import { documentServingHeaders } from "@/lib/document-serving";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Serve a shared plan to the signed-in client portal. Only documents explicitly
// shared with the client are reachable, and the job must belong to the client in
// the portal session (not a client id from the URL).
export async function GET(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return new Response("Not found", { status: 404 });

  const doc = await prisma.document.findUnique({
    where: { id: (await params).id },
    include: { job: { select: { clientId: true } } },
  });
  if (!doc || !doc.sharedWithClient || !doc.fileData || !doc.job.clientId || doc.job.clientId !== portal.id) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = Buffer.from(doc.fileData, "base64");
  return new Response(bytes, { headers: documentServingHeaders(doc.mimeType, doc.name) });
}

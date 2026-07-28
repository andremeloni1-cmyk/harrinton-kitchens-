import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { generatedSvgHeaders } from "@/lib/document-serving";
import { PLAN_SOURCE } from "@/lib/design-docs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; docId: string }> };

/**
 * Stream a generated plan back as renderable SVG.
 *
 * The lookup is scoped to `source: PLAN_SOURCE` on purpose, and that scoping is
 * what makes serving it inline safe: only documents this app drew itself can
 * come out of here, never an upload. Anything else — including a real document
 * on the same job — is a 404.
 */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("view");
  if (gate instanceof Response) return gate;
  const { id, docId } = await params;

  const doc = await prisma.document.findFirst({
    where: { id: docId, jobId: id, source: PLAN_SOURCE, mimeType: "image/svg+xml" },
    select: { name: true, fileData: true },
  });
  if (!doc?.fileData) return json({ error: "not found" }, 404);

  return new Response(Buffer.from(doc.fileData, "base64"), { headers: generatedSvgHeaders(doc.name) });
}

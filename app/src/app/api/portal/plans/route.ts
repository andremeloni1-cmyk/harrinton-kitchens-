import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

// Public (portal) endpoint: the client approves a shared plan or requests
// changes. The document must belong to a job owned by the given client.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const action = body.action === "approve" ? "approve" : body.action === "changes" ? "changes" : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!clientId || !documentId || !action) return json({ error: "clientId, documentId and action are required" }, 400);
  if (action === "changes" && !note) return json({ error: "Please describe the changes you'd like." }, 400);

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { job: { select: { id: true, clientId: true, clientName: true } } },
  });
  if (!doc || !doc.sharedWithClient || doc.job.clientId !== clientId) return json({ error: "not found" }, 404);

  const document = await prisma.document.update({
    where: { id: doc.id },
    data: {
      reviewStatus: action === "approve" ? "approved" : "changes_requested",
      reviewNote: action === "changes" ? note : null,
      reviewedAt: new Date(),
    },
  });

  await logActivity(
    doc.job.id,
    "note",
    action === "approve"
      ? `✅ ${doc.job.clientName || "The client"} approved the plan "${doc.name}" on the portal.`
      : `✏️ ${doc.job.clientName || "The client"} requested changes to "${doc.name}": ${note}`
  ).catch(() => {});

  return json({ ok: true, document: { ...document, fileData: undefined } });
}

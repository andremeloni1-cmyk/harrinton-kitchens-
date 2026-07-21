import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { sniffImageType } from "@/lib/enquiry";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const MAX_B64 = 15 * 1024 * 1024;

// Attach a photo taken at a station to the job (stored inline).
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;

  const js = await prisma.jobStation.findUnique({
    where: { id },
    include: { station: { select: { name: true } } },
  });
  if (!js) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const fileData = typeof body.fileData === "string" ? body.fileData : "";
  if (!fileData || fileData.length > MAX_B64) return json({ error: "A photo is required (11 MB max)." }, 400);
  const mimeType = sniffImageType(Buffer.from(fileData, "base64"));
  if (!mimeType) return json({ error: "That doesn’t look like an image." }, 400);

  await prisma.document.create({
    data: {
      jobId: js.jobId,
      name: `${js.station.name} — floor photo`,
      source: "factory",
      mimeType,
      fileData,
    },
  });
  await logActivity(js.jobId, "note", `Factory: photo added at ${js.station.name}`);
  return json({ ok: true });
}

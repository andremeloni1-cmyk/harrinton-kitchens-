import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { documentServingHeaders } from "@/lib/document-serving";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ~8 MB of base64 (≈6 MB image) — a phone photo taken on a driveway.
const MAX_B64_LENGTH = 8 * 1024 * 1024;

// Only types that can be served back inline safely. HEIC is excluded here (it
// is allowed for mudmaps) because a proof has to be viewable in the browser by
// whoever is settling the argument.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * With `?proofId=` streams that photo back; without one, lists the load's
 * proofs and leaves the bytes out — a load can carry dozens of photos and the
 * index is read every time the screen opens.
 */
export async function GET(req: Request, { params }: Params) {
  const gate = await requirePermission("view");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;
  const proofId = new URL(req.url).searchParams.get("proofId") || "";

  if (!proofId) {
    const proofs = await prisma.deliveryProof.findMany({
      where: { loadId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        itemId: true,
        stopId: true,
        note: true,
        latitude: true,
        longitude: true,
        deliveredByName: true,
        createdAt: true,
      },
    });
    return json({ proofs });
  }

  const proof = await prisma.deliveryProof.findFirst({
    where: { id: proofId, loadId },
    select: { photoData: true, photoMime: true, createdAt: true },
  });
  if (!proof) return json({ error: "not found" }, 404);

  return new Response(Buffer.from(proof.photoData, "base64"), {
    headers: documentServingHeaders(proof.photoMime, `proof-${proof.createdAt.toISOString()}`),
  });
}

/**
 * Record that something reached site, with a photo.
 *
 * Two things are deliberate. The timestamp is **server** time: a driver's phone
 * clock is trivially wrong and trivially changed, and this record exists to
 * settle an argument months later. And the photo is keyed by the hash of its
 * own bytes, so re-uploading the same image can't quietly overwrite an earlier
 * proof — a second upload of identical bytes against the same target is treated
 * as the same proof rather than a new one.
 *
 * itemId is optional: without one this is a site photo for the whole stop,
 * which belongs to the drop rather than to any single line.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;

  const load = await prisma.load.findUnique({ where: { id: loadId }, select: { id: true } });
  if (!load) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const photoData = typeof body.photoData === "string" ? body.photoData : "";
  const photoMime = typeof body.photoMime === "string" ? body.photoMime.toLowerCase() : "";
  if (!photoData) return json({ error: "A photo is required to prove delivery." }, 400);
  if (photoData.length > MAX_B64_LENGTH) return json({ error: "Photo is too large (6 MB max)." }, 400);
  if (!ALLOWED_MIME.has(photoMime)) {
    return json({ error: "The proof photo must be a JPEG, PNG or WebP image." }, 400);
  }

  const itemId = typeof body.itemId === "string" && body.itemId ? body.itemId : null;
  const item = itemId
    ? await prisma.loadItem.findFirst({ where: { id: itemId, loadId }, select: { id: true, stopId: true } })
    : null;
  if (itemId && !item) return json({ error: "that line isn't on this load" }, 400);

  const stopId =
    typeof body.stopId === "string" && body.stopId ? body.stopId : (item?.stopId ?? null);
  if (stopId) {
    const stop = await prisma.loadStop.findFirst({ where: { id: stopId, loadId }, select: { id: true } });
    if (!stop) return json({ error: "that stop isn't on this load" }, 400);
  }

  const photoHash = crypto.createHash("sha256").update(Buffer.from(photoData, "base64")).digest("hex");

  // Same bytes, same target, already recorded — return the existing proof
  // rather than stacking duplicates from a double-tap on a bad connection.
  const duplicate = await prisma.deliveryProof.findFirst({
    where: { loadId, itemId, photoHash },
    select: { id: true, createdAt: true },
  });
  if (duplicate) return json({ proof: duplicate, duplicate: true });

  const proof = await prisma.deliveryProof.create({
    data: {
      loadId,
      stopId,
      itemId,
      photoData,
      photoMime,
      photoHash,
      note: typeof body.note === "string" ? body.note.trim() : "",
      latitude: Number.isFinite(body.latitude) ? body.latitude : null,
      longitude: Number.isFinite(body.longitude) ? body.longitude : null,
      deliveredById: gate.id,
      deliveredByName: gate.name,
    },
    select: { id: true, createdAt: true },
  });

  // Proving a line arrived means it was on the truck. Recording the delivery
  // and the state change as one act stops the two drifting apart.
  if (item) {
    await prisma.loadItem.updateMany({
      where: { id: item.id, loadedAt: null },
      data: { loadedAt: new Date(), loadedById: gate.id, method: "tap" },
    });
  }

  return json({ proof }, 201);
}

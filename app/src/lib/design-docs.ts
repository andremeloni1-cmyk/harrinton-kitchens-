// Document `source` values owned by the design step.
//
// Both are internal by design: a mudmap is a biro sketch and a generated plan
// is a working reference, neither is something a homeowner should be handed.
// The client only ever sees the finished drawing set, which goes through the
// existing DrawingSet → revision → portal approval flow.
export const MUDMAP_SOURCE = "mudmap";
export const PLAN_SOURCE = "measure_plan";

/**
 * Photos taken during the check measure and attached to a specific room.
 *
 * Separate from the general "upload" source because these are evidence, not
 * progress photos: they belong to a room in the measure, are referenced as
 * CM-1042-R1-IMG2, and — like the mudmap — are working documents the client
 * never sees. Keeping the source distinct is what stops a site photo of an
 * exposed stud wall turning up in the client's portal gallery.
 */
export const MEASURE_PHOTO_SOURCE = "measure_photo";

/** Images the site sheet reader and the mudmap upload both accept. */
export const MUDMAP_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];

export function isMudmapMime(mime: string): boolean {
  return MUDMAP_MIME.includes(mime.toLowerCase());
}

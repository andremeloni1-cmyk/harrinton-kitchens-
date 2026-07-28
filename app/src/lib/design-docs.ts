// Document `source` values owned by the design step.
//
// Both are internal by design: a mudmap is a biro sketch and a generated plan
// is a working reference, neither is something a homeowner should be handed.
// The client only ever sees the finished drawing set, which goes through the
// existing DrawingSet → revision → portal approval flow.
export const MUDMAP_SOURCE = "mudmap";
export const PLAN_SOURCE = "measure_plan";

/** Images the site sheet reader and the mudmap upload both accept. */
export const MUDMAP_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];

export function isMudmapMime(mime: string): boolean {
  return MUDMAP_MIME.includes(mime.toLowerCase());
}

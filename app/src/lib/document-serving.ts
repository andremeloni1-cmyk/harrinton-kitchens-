// Response headers for streaming a stored document back to a browser.
//
// A document's mimeType is whatever was supplied at upload and stored verbatim.
// Serving an arbitrary type `inline` lets an uploaded text/html or SVG
// "document" execute as stored XSS in the staff app or a client's portal. So
// only known-inert, renderable types are served inline; everything else is
// forced to download with a neutral type and can never run as script.
const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export function documentServingHeaders(mimeType: string | null | undefined, name: string): Record<string, string> {
  const safeName = (name || "document").replace(/[^\w.\- ]/g, "_");
  const mt = typeof mimeType === "string" ? mimeType : "";
  if (INLINE_SAFE.has(mt)) {
    return {
      "content-type": mt,
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "no-store",
    };
  }
  return {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="${safeName}"`,
    "cache-control": "no-store",
  };
}

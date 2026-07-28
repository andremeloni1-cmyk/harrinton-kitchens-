// Response headers for streaming a stored document back to a browser.
//
// A document's mimeType is whatever was supplied at upload and stored verbatim.
// Serving an arbitrary type `inline` lets an uploaded text/html or SVG
// "document" execute as stored XSS in the staff app or a client's portal. So
// only known-inert, renderable types are served inline; everything else is
// forced to download with a neutral type and can never run as script.
const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

/**
 * Headers for an SVG this app generated itself (a plan drawn from a check
 * measure), which the rule above would otherwise force to download.
 *
 * The rule exists because an uploaded document's mimeType and bytes are both
 * attacker-controlled. These bytes are not: they come out of renderPlanSvg with
 * every interpolated string escaped, and the caller must scope its lookup to the
 * generated-plan source so an upload can never be served through here.
 *
 * Belt and braces anyway — `default-src 'none'` stops script inside the SVG
 * running even when it is navigated to directly, which is the case the
 * download-everything rule was really defending.
 */
export function generatedSvgHeaders(name: string): Record<string, string> {
  const safeName = (name || "plan").replace(/[^\w.\- ]/g, "_");
  return {
    "content-type": "image/svg+xml",
    "content-disposition": `inline; filename="${safeName}.svg"`,
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };
}

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

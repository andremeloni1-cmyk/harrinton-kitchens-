import { describe, it, expect } from "vitest";
import { documentServingHeaders, generatedSvgHeaders } from "./document-serving";

// P2-A2: an uploaded document's mimeType is stored verbatim; serving an
// arbitrary type inline would be stored XSS. Only inert renderable types may go
// inline — everything else must download.
describe("documentServingHeaders", () => {
  it("serves PDFs and raster images inline with their own type", () => {
    expect(documentServingHeaders("application/pdf", "plan.pdf")).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="plan.pdf"',
    });
    for (const mt of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      const h = documentServingHeaders(mt, "photo");
      expect(h["content-type"]).toBe(mt);
      expect(h["content-disposition"]).toMatch(/^inline;/);
    }
  });

  it("forces HTML/SVG/unknown types to download as a neutral type", () => {
    for (const mt of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "", null, undefined]) {
      const h = documentServingHeaders(mt, "evil.html");
      expect(h["content-type"]).toBe("application/octet-stream");
      expect(h["content-disposition"]).toMatch(/^attachment;/);
    }
  });

  it("sanitises the filename in the disposition", () => {
    expect(documentServingHeaders("application/pdf", 'a"b;c.pdf')["content-disposition"]).toBe(
      'inline; filename="a_b_c.pdf"'
    );
  });
});

// Plans this app draws itself are SVG, which the rule above forces to download.
// They get their own route, scoped to generated plans only, and are hardened so
// that even direct navigation can't run script inside one.
describe("generatedSvgHeaders", () => {
  it("serves SVG inline, unlike the general document path", () => {
    const h = generatedSvgHeaders("Plan — Kitchen");
    expect(h["content-type"]).toBe("image/svg+xml");
    expect(h["content-disposition"]).toMatch(/^inline;/);
    expect(documentServingHeaders("image/svg+xml", "x")["content-disposition"]).toMatch(/^attachment;/);
  });

  it("blocks script and subresources even on a direct hit", () => {
    const h = generatedSvgHeaders("plan");
    expect(h["content-security-policy"]).toContain("default-src 'none'");
    expect(h["content-security-policy"]).toContain("sandbox");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  it("sanitises the filename and never caches", () => {
    expect(generatedSvgHeaders('a"b;c')["content-disposition"]).toBe('inline; filename="a_b_c.svg"');
    expect(generatedSvgHeaders("")["content-disposition"]).toBe('inline; filename="plan.svg"');
    expect(generatedSvgHeaders("plan")["cache-control"]).toBe("no-store");
  });
});

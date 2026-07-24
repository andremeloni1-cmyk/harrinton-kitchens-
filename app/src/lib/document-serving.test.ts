import { describe, it, expect } from "vitest";
import { documentServingHeaders } from "./document-serving";

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

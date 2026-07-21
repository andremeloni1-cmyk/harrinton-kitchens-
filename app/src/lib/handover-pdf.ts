import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

// Handover pack PDF (P10.4): a client-facing certificate — approved drawings,
// care instructions, warranty terms, and the snag closure — signed off on site.

export type HandoverInput = {
  companyName: string;
  jobReference: string;
  jobTitle: string;
  clientName: string | null;
  address: string | null;
  drawings: string[];
  snags: { done: number; total: number };
  careInstructions: string[];
  warranty: string[];
  signerName: string;
  signedAt: Date;
  signaturePngBase64?: string | null;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.5);

export async function generateHandoverPdf(input: HandoverInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = A4;

  let page = pdf.addPage(A4);
  let y = H - MARGIN;

  const ensure = (need: number) => {
    if (y - need < MARGIN) { page = pdf.addPage(A4); y = H - MARGIN; }
  };
  const text = (s: string, size: number, f: PDFFont, color = INK, indent = 0) => {
    ensure(size + 6);
    page.drawText(s, { x: MARGIN + indent, y: y - size, size, font: f, color });
    y -= size + 6;
  };
  const wrapped = (s: string, size: number, f: PDFFont, color = INK, indent = 0) => {
    for (const line of wrapText(s, f, size, W - MARGIN * 2 - indent)) text(line, size, f, color, indent);
  };
  const gap = (n: number) => { y -= n; };
  const rule = () => { ensure(12); page.drawLine({ start: { x: MARGIN, y }, end: { x: W - MARGIN, y }, thickness: 0.75, color: rgb(0.85, 0.85, 0.88) }); y -= 12; };
  const heading = (s: string) => { gap(6); text(s.toUpperCase(), 11, bold, MUTED); gap(2); };

  // Header
  text(input.companyName, 12, bold, MUTED);
  gap(4);
  text("Handover Certificate", 24, bold);
  gap(6);
  text(`${input.jobReference} — ${input.jobTitle}`, 12, font, MUTED);
  if (input.clientName) text(`Prepared for ${input.clientName}`, 11, font, MUTED);
  if (input.address) text(input.address, 11, font, MUTED);
  gap(6); rule();

  // Approved drawings
  heading("Approved drawings");
  if (input.drawings.length) input.drawings.forEach((d) => text(`•  ${d}`, 11, font, INK, 4));
  else text("No released drawings on file.", 11, font, MUTED, 4);

  // Snag closure
  gap(8); heading("Snag closure");
  if (input.snags.total === 0) text("No snags were raised — clean handover.", 11, font);
  else {
    const outstanding = input.snags.total - input.snags.done;
    text(`${input.snags.done} of ${input.snags.total} finishing items completed.`, 11, font);
    if (outstanding > 0) text(`${outstanding} item${outstanding === 1 ? "" : "s"} scheduled to complete.`, 11, font, rgb(0.7, 0.4, 0.05));
  }

  // Care instructions
  gap(8); heading("Caring for your kitchen");
  input.careInstructions.forEach((c) => wrapped(`•  ${c}`, 11, font, INK, 4));

  // Warranty
  gap(8); heading("Warranty");
  input.warranty.forEach((w) => wrapped(`•  ${w}`, 11, font, INK, 4));

  // Sign-off
  gap(16); rule();
  heading("Signed on completion");
  if (input.signaturePngBase64) {
    try {
      const img = await pdf.embedPng(Buffer.from(input.signaturePngBase64, "base64"));
      const w = 150, h = (img.height / img.width) * w || 50;
      ensure(h + 6);
      page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: Math.min(h, 60) });
      y -= Math.min(h, 60) + 6;
    } catch { /* skip a bad signature image */ }
  }
  text(input.signerName, 14, bold);
  text(`Signed ${input.signedAt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, 10, font, MUTED);
  gap(10);
  wrapped(`This certificate confirms the works described above were completed and handed over by ${input.companyName}.`, 9, font, MUTED);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function wrapText(s: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

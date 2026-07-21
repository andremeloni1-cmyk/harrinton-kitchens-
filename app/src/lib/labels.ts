import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Per-job QR label sheet (P8.2). Each label carries a QR encoding "HK:<partId>"
// (namespaced so the scanner ignores random codes) plus human-readable cabinet /
// part / dimensions. Printed, cut up, and stuck on the physical parts.

export type LabelItem = { id: string; cabinet: string; part: string; detail?: string };

const A4: [number, number] = [595.28, 841.89];

export async function generateLabelSheet(
  meta: { jobReference: string },
  items: LabelItem[]
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = A4;
  const margin = 36;
  const cols = 2;
  const rows = 5; // 10 labels / page
  const cellW = (W - margin * 2) / cols;
  const cellH = (H - margin * 2) / rows;
  const qr = 92;

  const perPage = cols * rows;
  let page = pdf.addPage(A4);

  for (let i = 0; i < items.length; i++) {
    const onPage = i % perPage;
    if (i > 0 && onPage === 0) page = pdf.addPage(A4);
    const col = onPage % cols;
    const row = Math.floor(onPage / cols);
    const x = margin + col * cellW;
    const y = H - margin - (row + 1) * cellH; // bottom-left of the cell

    page.drawRectangle({ x, y, width: cellW - 6, height: cellH - 6, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });

    const item = items[i];
    try {
      const png = await QRCode.toBuffer(`HK:${item.id}`, { errorCorrectionLevel: "M", margin: 1, width: 200 });
      const img = await pdf.embedPng(png);
      page.drawImage(img, { x: x + 10, y: y + cellH - qr - 14, width: qr, height: qr });
    } catch {
      /* skip QR if it can't render */
    }

    const tx = x + qr + 22;
    let ty = y + cellH - 26;
    page.drawText(item.cabinet.slice(0, 26), { x: tx, y: ty, size: 11, font: bold });
    ty -= 15;
    page.drawText(item.part.slice(0, 28), { x: tx, y: ty, size: 10, font });
    if (item.detail) {
      ty -= 13;
      page.drawText(item.detail.slice(0, 30), { x: tx, y: ty, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    }
    ty -= 16;
    page.drawText(meta.jobReference, { x: tx, y: ty, size: 8, font, color: rgb(0.55, 0.55, 0.55) });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

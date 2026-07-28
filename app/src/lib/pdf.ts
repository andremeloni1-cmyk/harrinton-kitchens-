import { PDFDocument, StandardFonts, rgb, PDFString, PDFName, type PDFFont, type PDFPage } from "pdf-lib";
import { BRAND } from "./brand";

export type ChecklistItem = { label: string; done: boolean };
export type RoomEntry = { name: string; work?: string; items?: ChecklistItem[] };

export type ReportData = {
  scope?: string; // e.g. "Kitchen installation"
  jobType?: string; // kitchen | bathroom | laundry | wardrobe | other
  driveImagesLink?: string; // Google Drive link to site photos
  signOffName?: string; // client sign-off
  signOffDate?: string;
  signOffSignature?: string; // PNG data URL of the client's drawn signature
  engineer?: string;
  visitDate?: string;
  workCarried?: string;
  findings?: string;
  recommendations?: string;
  materialsUsed?: string;
  followUp?: string;
  outstandingWorks?: string; // still-to-be-done items, one per line
  condition?: string; // Good | Fair | Needs attention
  nextServiceDate?: string;
  rooms?: RoomEntry[]; // per-room breakdown + completion checklist
};

type Meta = {
  jobTitle: string;
  reference: string;
  clientName?: string | null;
  address?: string | null;
  ownerName?: string | null;
  /** business logo for the header band (light/white variant reads best) */
  logo?: { base64: string; mime: string } | null;
};

// Brand palette (matches the app).
const CHARCOAL = rgb(0.09, 0.09, 0.09); // #171717 header band
const ORANGE = rgb(0.051, 0.58, 0.533); // #0D9488 brand teal accents
const INK = rgb(0.11, 0.1, 0.09); // body text
const MUTED = rgb(0.47, 0.44, 0.42); // secondary text
const FAINT = rgb(0.71, 0.68, 0.66); // labels
const RULE = rgb(0.9, 0.89, 0.88); // hairlines
const PANEL = rgb(0.972, 0.968, 0.96); // info panel fill
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.13, 0.55, 0.31);
const AMBER = rgb(0.75, 0.48, 0.06);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

// The standard PDF fonts only encode WinAnsi (CP1252); pdf-lib THROWS on any
// character outside it (emoji, CJK, arrows, ✓ …), which would 500 the whole
// report. Replace a few common symbols with ASCII, then drop anything the font
// can't render. Latin-1 accents and CP1252 punctuation (curly quotes, dashes,
// bullet, ellipsis, €, ™) are kept — pdf-lib maps those fine.
function toWinAnsi(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[→⟶➔➜]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[✓✔✅☑]/g, "")
    .replace(/[✗✘❌]/g, "x")
    .replace(/[•·]/g, "-")
    // Keep printable ASCII, Latin-1, CP1252 punctuation, and newlines/tabs
    // (multi-line fields like outstanding-works split on "\n" after this).
    .replace(
      /[^\n\r\t\x20-\x7E\xA0-\xFF–—‘’“”†‡•…‰‹›€™ŒœŠšŸŽžƒˆ˜]/g,
      ""
    );
}

// Clean every user-supplied string on the report before it reaches drawText.
function sanitizeData(d: ReportData): ReportData {
  return {
    ...d,
    // Only ever embed an http(s) link as a clickable PDF action — a
    // javascript:/file:/data: URI could run in the recipient's PDF reader.
    driveImagesLink: /^https?:\/\//i.test((d.driveImagesLink || "").trim())
      ? d.driveImagesLink!.trim()
      : undefined,
    scope: toWinAnsi(d.scope),
    engineer: toWinAnsi(d.engineer),
    visitDate: toWinAnsi(d.visitDate),
    workCarried: toWinAnsi(d.workCarried),
    findings: toWinAnsi(d.findings),
    recommendations: toWinAnsi(d.recommendations),
    materialsUsed: toWinAnsi(d.materialsUsed),
    outstandingWorks: toWinAnsi(d.outstandingWorks),
    condition: toWinAnsi(d.condition),
    nextServiceDate: toWinAnsi(d.nextServiceDate),
    signOffName: toWinAnsi(d.signOffName),
    signOffDate: toWinAnsi(d.signOffDate),
    rooms: d.rooms?.map((r) => ({
      name: toWinAnsi(r.name),
      work: toWinAnsi(r.work),
      items: r.items?.map((it) => ({ label: toWinAnsi(it.label), done: it.done })),
    })),
  };
}

/** Generates a polished A4 maintenance report PDF and returns the bytes. */
export async function generateReportPdf(metaIn: Meta, dataIn: ReportData): Promise<Buffer> {
  const meta: Meta = {
    ...metaIn,
    jobTitle: toWinAnsi(metaIn.jobTitle),
    reference: toWinAnsi(metaIn.reference),
    clientName: toWinAnsi(metaIn.clientName),
    address: toWinAnsi(metaIn.address),
    ownerName: toWinAnsi(metaIn.ownerName) || BRAND.name,
  };
  const data = sanitizeData(dataIn);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  const [width, height] = A4;
  const contentW = width - MARGIN * 2;
  let y = height - MARGIN;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = height - MARGIN;
  };
  // Reserve space above the footer zone on every page.
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 24) newPage();
  };

  // Wrap `s` to `maxW` points at `size`, returning lines.
  const wrap = (s: string, f: PDFFont, size: number, maxW: number): string[] => {
    const words = (s || "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    // Break a single token that's wider than the column into chunks that fit,
    // so a pasted URL or long code never overflows the right margin.
    const hardBreak = (w: string): string[] => {
      const parts: string[] = [];
      let chunk = "";
      for (const ch of w) {
        if (f.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) {
          parts.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk) parts.push(chunk);
      return parts;
    };
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
      // If the current single word alone still overflows, hard-break it.
      if (!line.includes(" ") && f.widthOfTextAtSize(line, size) > maxW) {
        const parts = hardBreak(line);
        lines.push(...parts.slice(0, -1));
        line = parts[parts.length - 1] || "";
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["—"];
  };

  const paragraph = (s: string, opts: { size?: number; lh?: number; x?: number; color?: ReturnType<typeof rgb>; font?: PDFFont; maxW?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const lh = opts.lh ?? 15.5;
    const x = opts.x ?? MARGIN;
    const maxW = opts.maxW ?? width - x - MARGIN;
    for (const l of wrap(s || "—", opts.font ?? font, size, maxW)) {
      ensureSpace(lh);
      page.drawText(l, { x, y, size, font: opts.font ?? font, color: opts.color ?? INK });
      y -= lh;
    }
  };

  // ---- Header band (first page) --------------------------------------------
  const BAND_H = 92;
  page.drawRectangle({ x: 0, y: height - BAND_H, width, height: BAND_H, color: CHARCOAL });
  page.drawRectangle({ x: 0, y: height - BAND_H - 3.5, width, height: 3.5, color: ORANGE });

  page.drawText("MAINTENANCE REPORT", {
    x: MARGIN,
    y: height - 38,
    size: 9.5,
    font: bold,
    color: ORANGE,
  });
  const owner = meta.ownerName || BRAND.name;
  page.drawText(owner, { x: MARGIN, y: height - 60, size: 20, font: bold, color: WHITE });
  page.drawText(`${meta.reference} — ${meta.jobTitle}`.slice(0, 70), {
    x: MARGIN,
    y: height - 77,
    size: 9.5,
    font,
    color: rgb(0.75, 0.74, 0.73),
  });

  // Logo, right-aligned inside the band (the light/dark-mode variant the
  // caller picked). Unsupported formats are simply skipped.
  if (meta.logo?.base64) {
    try {
      const bytes = Buffer.from(meta.logo.base64, "base64");
      const img = meta.logo.mime.includes("png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const maxH = 46;
      const maxW = 130;
      const scale = Math.min(maxH / img.height, maxW / img.width, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: width - MARGIN - w, y: height - (BAND_H + h) / 2, width: w, height: h });
    } catch {
      /* not a PNG/JPG — leave the band text-only */
    }
  }

  y = height - BAND_H - 28;

  // ---- Job details panel ----------------------------------------------------
  const detail: [string, string][] = [
    ["REFERENCE", meta.reference],
    ["VISIT DATE", data.visitDate || "—"],
    ["CLIENT", meta.clientName || "—"],
    ["FITTER", data.engineer || "—"],
  ];
  const fullRows: [string, string][] = [
    ["SITE ADDRESS", meta.address || "—"],
    ...(data.scope ? ([["SCOPE OF WORK", data.scope]] as [string, string][]) : []),
  ];

  const colW = contentW / 2;
  const rowH = 30;
  const fullRowHs = fullRows.map(
    ([, v]) => 12 + wrap(v, font, 10.5, contentW - 24).length * 13.5 + 6
  );
  const panelH = 12 + Math.ceil(detail.length / 2) * rowH + fullRowHs.reduce((a, b) => a + b, 0) + 4;

  page.drawRectangle({
    x: MARGIN,
    y: y - panelH,
    width: contentW,
    height: panelH,
    color: PANEL,
    borderColor: RULE,
    borderWidth: 1,
  });

  let py = y - 22;
  for (let i = 0; i < detail.length; i += 2) {
    for (let c = 0; c < 2 && i + c < detail.length; c++) {
      const [k, v] = detail[i + c];
      const x = MARGIN + 12 + c * colW;
      page.drawText(k, { x, y: py, size: 7.5, font: bold, color: FAINT });
      page.drawText(v.slice(0, 48), { x, y: py - 13, size: 10.5, font, color: INK });
    }
    py -= rowH;
  }
  for (let i = 0; i < fullRows.length; i++) {
    const [k, v] = fullRows[i];
    page.drawText(k, { x: MARGIN + 12, y: py, size: 7.5, font: bold, color: FAINT });
    let vy = py - 13;
    for (const l of wrap(v, font, 10.5, contentW - 24)) {
      page.drawText(l, { x: MARGIN + 12, y: vy, size: 10.5, font, color: INK });
      vy -= 13.5;
    }
    py = vy - 4.5;
  }
  y -= panelH + 26;

  // ---- Section helpers ------------------------------------------------------
  const sectionHeading = (heading: string) => {
    ensureSpace(40);
    page.drawRectangle({ x: MARGIN, y: y - 1.5, width: 12, height: 3.5, color: ORANGE });
    page.drawText(heading, { x: MARGIN + 20, y: y - 2, size: 11.5, font: bold, color: INK });
    const tw = bold.widthOfTextAtSize(heading, 11.5);
    page.drawLine({
      start: { x: MARGIN + 28 + tw, y },
      end: { x: width - MARGIN, y },
      thickness: 0.75,
      color: RULE,
    });
    y -= 22;
  };

  const section = (heading: string, body?: string) => {
    if (!body?.trim()) return; // skip empty sections — keeps the report tight
    sectionHeading(heading);
    paragraph(body);
    y -= 14;
  };

  // Checkbox drawn as vector art (crisp at any zoom).
  const checkbox = (x: number, cy: number, done: boolean) => {
    const s = 9;
    if (done) {
      page.drawRectangle({ x, y: cy, width: s, height: s, color: ORANGE });
      page.drawLine({ start: { x: x + 2, y: cy + 4.4 }, end: { x: x + 3.7, y: cy + 2.4 }, thickness: 1.3, color: WHITE });
      page.drawLine({ start: { x: x + 3.7, y: cy + 2.4 }, end: { x: x + 7, y: cy + 6.6 }, thickness: 1.3, color: WHITE });
    } else {
      page.drawRectangle({ x, y: cy, width: s, height: s, borderColor: rgb(0.65, 0.62, 0.6), borderWidth: 1 });
    }
  };

  // ---- Body -----------------------------------------------------------------
  section("Work carried out", data.workCarried);

  if (data.rooms?.some((r) => r.name || r.work || (r.items || []).length)) {
    sectionHeading("Work by room");
    for (const room of data.rooms!) {
      const items = room.items || [];
      if (!room.name && !room.work && items.length === 0) continue;
      const done = items.filter((it) => it.done).length;

      ensureSpace(24);
      page.drawText(room.name || "Room", { x: MARGIN, y, size: 11, font: bold, color: INK });
      if (items.length > 0) {
        const label = `${done}/${items.length} complete`;
        const lw = font.widthOfTextAtSize(label, 9);
        page.drawText(label, {
          x: width - MARGIN - lw,
          y: y + 0.5,
          size: 9,
          font: bold,
          color: done === items.length ? GREEN : AMBER,
        });
      }
      y -= 16;
      if (room.work) {
        paragraph(room.work, { color: MUTED, size: 10 });
        y -= 2;
      }
      for (const it of items) {
        ensureSpace(16);
        checkbox(MARGIN + 2, y - 1, it.done);
        page.drawText(it.label, { x: MARGIN + 18, y, size: 10, font, color: it.done ? MUTED : INK });
        y -= 15.5;
      }
      const outstanding = items.filter((it) => !it.done);
      if (outstanding.length > 0) {
        ensureSpace(16);
        y -= 2;
        page.drawText(`${outstanding.length} item(s) still to be completed`, {
          x: MARGIN + 18,
          y,
          size: 9,
          font: bold,
          color: AMBER,
        });
        y -= 15;
      }
      y -= 8;
    }
    y -= 8;
  }

  section("Findings", data.findings);
  section("Materials used", data.materialsUsed);
  section("Recommendations", data.recommendations);

  // ---- Outstanding works (highlighted so the company can't miss it) ---------
  const outstandingLines = (data.outstandingWorks || "")
    .split("\n")
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
  if (outstandingLines.length > 0) {
    const AMBER_FILL = rgb(1, 0.973, 0.914); // soft amber wash
    const AMBER_BORDER = rgb(0.93, 0.79, 0.45);
    const bulletX = MARGIN + 16;
    const textX = bulletX + 14;
    const lineMaxW = width - textX - MARGIN - 12;
    const wrapped = outstandingLines.map((l) => wrap(l, font, 10.5, lineMaxW));
    const bodyH = wrapped.reduce((a, ls) => a + ls.length * 15 + 6, 0);
    const boxH = 30 + bodyH + 8;
    const usable = height - MARGIN - (MARGIN + 24);

    // Draw one bullet block at the current y; returns the height consumed.
    const drawItem = (ls: string[]) => {
      page.drawCircle({ x: bulletX + 2, y: y + 3, size: 2, color: AMBER });
      for (const l of ls) {
        page.drawText(l, { x: textX, y, size: 10.5, font, color: INK });
        y -= 15;
      }
      y -= 6;
    };

    if (boxH <= usable) {
      // Fits on a page — draw the highlighted box as one unit.
      ensureSpace(boxH + 8);
      page.drawRectangle({ x: MARGIN, y: y - boxH, width: contentW, height: boxH, color: AMBER_FILL, borderColor: AMBER_BORDER, borderWidth: 1 });
      page.drawRectangle({ x: MARGIN, y: y - boxH, width: 3.5, height: boxH, color: AMBER });
      page.drawText("STILL TO BE COMPLETED", { x: MARGIN + 16, y: y - 20, size: 10.5, font: bold, color: rgb(0.6, 0.38, 0.04) });
      y -= 38;
      for (const ls of wrapped) drawItem(ls);
      y -= 16;
    } else {
      // Too long for one box — render a page-safe list so nothing is lost.
      ensureSpace(30);
      page.drawRectangle({ x: MARGIN, y: y - 1.5, width: 12, height: 3.5, color: AMBER });
      page.drawText("STILL TO BE COMPLETED", { x: MARGIN + 20, y: y - 2, size: 10.5, font: bold, color: rgb(0.6, 0.38, 0.04) });
      y -= 22;
      for (const ls of wrapped) {
        ensureSpace(ls.length * 15 + 6);
        drawItem(ls);
      }
      y -= 10;
    }
  }

  // ---- Site photos (clickable link) ----------------------------------------
  if (data.driveImagesLink) {
    sectionHeading("Site photos");
    const label = "View the site photos on Google Drive";
    const size = 10.5;
    ensureSpace(20);
    const tw = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: MARGIN, y, size, font, color: ORANGE });
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: MARGIN + tw, y: y - 2 },
      thickness: 0.75,
      color: ORANGE,
    });
    const link = pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [MARGIN, y - 3, MARGIN + tw, y + size],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(data.driveImagesLink) },
      })
    );
    const annots = page.node.Annots();
    if (annots) annots.push(link);
    else page.node.set(PDFName.of("Annots"), pdf.context.obj([link]));
    y -= 30;
  }

  // ---- Condition summary panel ----------------------------------------------
  if (data.condition || data.nextServiceDate) {
    ensureSpace(70);
    const boxH = 54;
    page.drawRectangle({
      x: MARGIN,
      y: y - boxH,
      width: contentW,
      height: boxH,
      color: PANEL,
      borderColor: RULE,
      borderWidth: 1,
    });
    page.drawRectangle({ x: MARGIN, y: y - boxH, width: 3.5, height: boxH, color: ORANGE });
    page.drawText("OVERALL CONDITION", { x: MARGIN + 16, y: y - 22, size: 7.5, font: bold, color: FAINT });
    page.drawText(data.condition || "—", { x: MARGIN + 16, y: y - 37, size: 12, font: bold, color: INK });
    page.drawText("NEXT SERVICE DUE", { x: MARGIN + 16 + contentW / 2, y: y - 22, size: 7.5, font: bold, color: FAINT });
    page.drawText(data.nextServiceDate || "—", { x: MARGIN + 16 + contentW / 2, y: y - 37, size: 12, font: bold, color: INK });
    y -= boxH + 28;
  }

  // ---- Client sign-off --------------------------------------------------------
  ensureSpace(90);
  y -= 18;
  const half = contentW / 2 - 16;
  const signName = data.signOffName || "";
  const signDate = data.signOffDate || "";

  // Drawn signature sits above the left rule when present; otherwise the typed
  // name goes on the line.
  let drewSignature = false;
  if (data.signOffSignature?.startsWith("data:image")) {
    try {
      const base64 = data.signOffSignature.split(",")[1] || "";
      const img = await pdf.embedPng(Buffer.from(base64, "base64"));
      const maxW = half - 8;
      const maxH = 32;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      page.drawImage(img, { x: MARGIN + 4, y: y + 3, width: img.width * scale, height: img.height * scale });
      drewSignature = true;
    } catch {
      /* fall back to the typed name */
    }
  }
  if (signName && !drewSignature) page.drawText(signName, { x: MARGIN + 4, y: y + 4, size: 11, font, color: INK });
  if (signDate) page.drawText(signDate, { x: MARGIN + contentW / 2 + 20, y: y + 4, size: 11, font, color: INK });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + half, y }, thickness: 0.75, color: rgb(0.55, 0.52, 0.5) });
  page.drawLine({
    start: { x: MARGIN + contentW / 2 + 16, y },
    end: { x: width - MARGIN, y },
    thickness: 0.75,
    color: rgb(0.55, 0.52, 0.5),
  });
  const acceptedLabel = drewSignature && signName ? `Accepted by (client) — ${signName}` : "Accepted by (client)";
  page.drawText(acceptedLabel, { x: MARGIN, y: y - 13, size: 8, font, color: MUTED });
  page.drawText("Date", { x: MARGIN + contentW / 2 + 16, y: y - 13, size: 8, font, color: MUTED });

  // ---- Footer on every page ---------------------------------------------------
  const pages = pdf.getPages();
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  pages.forEach((p: PDFPage, i: number) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 16 },
      end: { x: width - MARGIN, y: MARGIN - 16 },
      thickness: 0.5,
      color: RULE,
    });
    p.drawText(`${owner} — ${meta.reference} • ${generated}`, {
      x: MARGIN,
      y: MARGIN - 28,
      size: 8,
      font,
      color: MUTED,
    });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, {
      x: width - MARGIN - font.widthOfTextAtSize(pn, 8),
      y: MARGIN - 28,
      size: 8,
      font,
      color: MUTED,
    });
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Quote PDF
// ---------------------------------------------------------------------------

export type QuoteLine = { description: string; quantity: number; unitAmount: number; isSection?: boolean };

export type QuoteMeta = {
  // Which document this is. The layout is shared — a tax invoice is a quote
  // with different words and a legal footer — so the variant is a flag rather
  // than a second renderer that would drift out of step.
  docType?: "QUOTE" | "TAX INVOICE";
  quoteNumber: string; // e.g. QUO-1001 or the job reference
  jobTitle: string;
  reference: string;
  billTo?: string | null; // who the quote is addressed to (the company)
  siteContact?: string | null; // homeowner / on-site contact
  address?: string | null;
  ownerName?: string | null;
  currency?: string;
  quoteDate?: string; // pre-formatted
  validUntil?: string; // pre-formatted
  notes?: string | null;
  logo?: { base64: string; mime: string } | null;
  // Precomputed totals (dollars) — when set, the summary block uses these
  // instead of recomputing, so it matches the caller's cents-exact figures.
  totals?: { subtotal: number; tax: number; total: number };
  // Drawings / renders to append as full-page images after the quote. PNG/JPEG
  // only (pdf-lib can't embed HEIC); bad images are skipped.
  appendixImages?: { base64: string; mime: string; caption?: string }[];
  // Tax-invoice only. An Australian tax invoice for more than $82.50 must show
  // the supplier's ABN, so it is printed whenever one is set.
  abn?: string | null;
  paymentDetails?: string | null;
};

/** Generates a polished A4 quote/estimate PDF and returns the bytes. Line
 * amounts are tax-exclusive; GST (10%) is added as a summary line. Lines flagged
 * `isSection` render as bold group headers. */
export async function generateQuotePdf(metaIn: QuoteMeta, linesIn: QuoteLine[]): Promise<Buffer> {
  const currency = metaIn.currency || "AUD";
  const fmt = (n: number) => {
    try {
      return toWinAnsi(new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n));
    } catch {
      return toWinAnsi(`$${n.toFixed(2)}`);
    }
  };
  const meta: QuoteMeta = {
    ...metaIn,
    quoteNumber: toWinAnsi(metaIn.quoteNumber),
    jobTitle: toWinAnsi(metaIn.jobTitle),
    reference: toWinAnsi(metaIn.reference),
    billTo: toWinAnsi(metaIn.billTo),
    siteContact: toWinAnsi(metaIn.siteContact),
    address: toWinAnsi(metaIn.address),
    ownerName: toWinAnsi(metaIn.ownerName) || BRAND.name,
    quoteDate: toWinAnsi(metaIn.quoteDate),
    validUntil: toWinAnsi(metaIn.validUntil),
    notes: toWinAnsi(metaIn.notes),
  };
  const lines: QuoteLine[] = (linesIn || []).map((l) => ({
    description: toWinAnsi(l.description) || "Item",
    quantity: Number.isFinite(l.quantity) ? l.quantity : 0,
    unitAmount: Number.isFinite(l.unitAmount) ? l.unitAmount : 0,
    isSection: l.isSection,
  }));

  const round2 = (n: number) => Math.round(n * 100) / 100;
  // Prefer the caller's cents-exact totals; else sum the priced (non-section)
  // lines and add 10% GST, as the standalone estimate route does.
  const subtotal = metaIn.totals
    ? round2(metaIn.totals.subtotal)
    : round2(lines.filter((l) => !l.isSection).reduce((s, l) => s + l.quantity * l.unitAmount, 0));
  const tax = metaIn.totals ? round2(metaIn.totals.tax) : round2(subtotal * 0.1);
  const total = metaIn.totals ? round2(metaIn.totals.total) : round2(subtotal + tax);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [width, height] = A4;
  const contentW = width - MARGIN * 2;
  let page = pdf.addPage(A4);
  let y = height - MARGIN;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = height - MARGIN;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 24) newPage();
  };
  const drawRight = (text: string, rightX: number, yy: number, size: number, f: PDFFont, color: ReturnType<typeof rgb>) => {
    page.drawText(text, { x: rightX - f.widthOfTextAtSize(text, size), y: yy, size, font: f, color });
  };
  // Word-wrap a string to a column width.
  const wrap = (s: string, f: PDFFont, size: number, maxW: number): string[] => {
    const words = (s || "").split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out.length ? out : ["—"];
  };

  // ---- Header band ----------------------------------------------------------
  const BAND_H = 92;
  page.drawRectangle({ x: 0, y: height - BAND_H, width, height: BAND_H, color: CHARCOAL });
  page.drawRectangle({ x: 0, y: height - BAND_H - 3.5, width, height: 3.5, color: ORANGE });
  const docType = meta.docType || "QUOTE";
  const isInvoice = docType === "TAX INVOICE";
  page.drawText(docType, { x: MARGIN, y: height - 38, size: 9.5, font: bold, color: ORANGE });
  page.drawText(meta.ownerName!, { x: MARGIN, y: height - 60, size: 20, font: bold, color: WHITE });
  page.drawText(`${meta.reference} — ${meta.jobTitle}`.slice(0, 70), {
    x: MARGIN,
    y: height - 77,
    size: 9.5,
    font,
    color: rgb(0.75, 0.74, 0.73),
  });
  if (meta.logo?.base64) {
    try {
      const bytes = Buffer.from(meta.logo.base64, "base64");
      const img = meta.logo.mime.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(46 / img.height, 130 / img.width, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: width - MARGIN - w, y: height - (BAND_H + h) / 2, width: w, height: h });
    } catch {
      /* leave text-only */
    }
  }
  y = height - BAND_H - 28;

  // ---- Meta panel -----------------------------------------------------------
  const details: [string, string][] = [
    [isInvoice ? "INVOICE NO." : "QUOTE NO.", meta.quoteNumber || meta.reference],
    ["DATE", meta.quoteDate || "—"],
    [isInvoice ? "DUE" : "VALID UNTIL", meta.validUntil || "—"],
    [isInvoice ? "FROM" : "PREPARED BY", meta.ownerName!],
  ];
  if (isInvoice && meta.abn) details.push(["ABN", meta.abn]);
  const fullRows: [string, string][] = [];
  if (meta.billTo) fullRows.push([isInvoice ? "BILL TO" : "QUOTE FOR", meta.billTo]);
  if (meta.siteContact) fullRows.push(["SITE CONTACT", meta.siteContact]);
  if (meta.address) fullRows.push(["SITE ADDRESS", meta.address]);

  const colW = contentW / 2;
  const rowH = 30;
  const fullRowHs = fullRows.map(([, v]) => 12 + wrap(v, font, 10.5, contentW - 24).length * 13.5 + 6);
  const panelH = 12 + Math.ceil(details.length / 2) * rowH + fullRowHs.reduce((a, b) => a + b, 0) + 4;

  page.drawRectangle({ x: MARGIN, y: y - panelH, width: contentW, height: panelH, color: PANEL, borderColor: RULE, borderWidth: 1 });
  let py = y - 22;
  for (let i = 0; i < details.length; i += 2) {
    for (let c = 0; c < 2 && i + c < details.length; c++) {
      const [k, v] = details[i + c];
      const x = MARGIN + 12 + c * colW;
      page.drawText(k, { x, y: py, size: 7.5, font: bold, color: FAINT });
      page.drawText(v.slice(0, 48), { x, y: py - 13, size: 10.5, font, color: INK });
    }
    py -= rowH;
  }
  for (const [k, v] of fullRows) {
    page.drawText(k, { x: MARGIN + 12, y: py, size: 7.5, font: bold, color: FAINT });
    let vy = py - 13;
    for (const l of wrap(v, font, 10.5, contentW - 24)) {
      page.drawText(l, { x: MARGIN + 12, y: vy, size: 10.5, font, color: INK });
      vy -= 13.5;
    }
    py = vy - 4.5;
  }
  y -= panelH + 28;

  // ---- Line-items table -----------------------------------------------------
  const colAmountR = width - MARGIN;
  const colUnitR = colAmountR - 82;
  const colQtyR = colUnitR - 52;
  const descX = MARGIN;
  const descMaxW = colQtyR - 34 - descX;

  const tableHeader = () => {
    page.drawText("DESCRIPTION", { x: descX, y, size: 7.5, font: bold, color: FAINT });
    drawRight("QTY", colQtyR, y, 7.5, bold, FAINT);
    drawRight("UNIT", colUnitR, y, 7.5, bold, FAINT);
    drawRight("AMOUNT", colAmountR, y, 7.5, bold, FAINT);
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.75, color: RULE });
    y -= 14;
  };
  ensureSpace(40);
  tableHeader();

  for (const l of lines) {
    if (l.isSection) {
      // Group header row: bold label spanning the table, with a hairline under.
      if (y - 26 < MARGIN + 24) {
        newPage();
        y -= 4;
        tableHeader();
      }
      y -= 4;
      page.drawText(l.description, { x: descX, y, size: 10.5, font: bold, color: INK });
      y -= 14;
      page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: width - MARGIN, y: y + 3 }, thickness: 0.4, color: RULE });
      y -= 4;
      continue;
    }
    const wrapped = wrap(l.description, font, 10, descMaxW);
    const rowH2 = wrapped.length * 14 + 6;
    if (y - rowH2 < MARGIN + 24) {
      newPage();
      y -= 4;
      tableHeader();
    }
    const topY = y;
    for (const wl of wrapped) {
      page.drawText(wl, { x: descX, y, size: 10, font, color: INK });
      y -= 14;
    }
    drawRight(String(l.quantity), colQtyR, topY, 10, font, MUTED);
    drawRight(fmt(l.unitAmount), colUnitR, topY, 10, font, MUTED);
    drawRight(fmt(round2(l.quantity * l.unitAmount)), colAmountR, topY, 10, bold, INK);
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: width - MARGIN, y: y + 2 }, thickness: 0.4, color: rgb(0.94, 0.93, 0.92) });
  }

  // ---- Totals ---------------------------------------------------------------
  ensureSpace(90);
  y -= 10;
  const labelR = colUnitR;
  const totalRow = (label: string, value: string, opts: { bold?: boolean; size?: number } = {}) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? 10.5;
    drawRight(label, labelR, y, size, f, opts.bold ? INK : MUTED);
    drawRight(value, colAmountR, y, size, f, opts.bold ? INK : INK);
    y -= size + 7;
  };
  totalRow("Subtotal (ex GST)", fmt(subtotal));
  totalRow("GST (10%)", fmt(tax));
  y -= 2;
  page.drawLine({ start: { x: labelR - 150, y: y + 6 }, end: { x: colAmountR, y: y + 6 }, thickness: 0.75, color: RULE });
  y -= 6;
  // Emphasised total with an orange keyline.
  drawRight("TOTAL", labelR, y, 12.5, bold, INK);
  drawRight(fmt(total), colAmountR, y, 12.5, bold, ORANGE);
  y -= 26;

  // ---- Notes ----------------------------------------------------------------
  const note =
    meta.notes ||
    (isInvoice
      ? "Payment is due by the date shown above. Prices are in " +
        currency +
        " and include GST where shown."
      : "This quote is valid for 30 days. Prices are in " +
        currency +
        " and include GST where shown. Please get in touch to accept or discuss.");
  ensureSpace(60);
  page.drawRectangle({ x: MARGIN, y: y - 1.5, width: 12, height: 3.5, color: ORANGE });
  page.drawText("Notes", { x: MARGIN + 20, y: y - 2, size: 11.5, font: bold, color: INK });
  y -= 20;
  for (const l of wrap(note, font, 10, contentW)) {
    ensureSpace(15);
    page.drawText(l, { x: MARGIN, y, size: 10, font, color: MUTED });
    y -= 15;
  }

  // ---- How to pay -----------------------------------------------------------
  // An invoice nobody can pay from is an invoice that gets chased, so the bank
  // details go on the document rather than only in the covering email.
  if (isInvoice && meta.paymentDetails) {
    y -= 12;
    ensureSpace(60);
    page.drawRectangle({ x: MARGIN, y: y - 1.5, width: 12, height: 3.5, color: ORANGE });
    page.drawText("How to pay", { x: MARGIN + 20, y: y - 2, size: 11.5, font: bold, color: INK });
    y -= 20;
    for (const raw of toWinAnsi(meta.paymentDetails).split("\n")) {
      for (const l of wrap(raw, font, 10, contentW)) {
        ensureSpace(15);
        page.drawText(l, { x: MARGIN, y, size: 10, font, color: MUTED });
        y -= 15;
      }
    }
  }

  // ---- Appendix: drawings / renders -----------------------------------------
  for (const im of metaIn.appendixImages || []) {
    try {
      const bytes = Buffer.from(im.base64, "base64");
      const img = im.mime.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const ap = pdf.addPage(A4);
      let ay = height - MARGIN;
      ap.drawText(toWinAnsi(im.caption || "Attachment"), { x: MARGIN, y: ay, size: 11, font: bold, color: INK });
      ay -= 20;
      const maxW = width - MARGIN * 2;
      const maxH = ay - MARGIN;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ap.drawImage(img, { x: (width - w) / 2, y: ay - h, width: w, height: h });
    } catch {
      /* skip an image pdf-lib can't embed (e.g. HEIC) */
    }
  }

  // ---- Footer on every page -------------------------------------------------
  const pages = pdf.getPages();
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  pages.forEach((p: PDFPage, i: number) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 16 }, end: { x: width - MARGIN, y: MARGIN - 16 }, thickness: 0.5, color: RULE });
    p.drawText(`${meta.ownerName} — ${isInvoice ? "Tax invoice" : "Quote"} ${meta.quoteNumber || meta.reference} • ${generated}`, {
      x: MARGIN,
      y: MARGIN - 28,
      size: 8,
      font,
      color: MUTED,
    });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: width - MARGIN - font.widthOfTextAtSize(pn, 8), y: MARGIN - 28, size: 8, font, color: MUTED });
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

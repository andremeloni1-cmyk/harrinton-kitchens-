import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { readSheetGrid, looksLikeXlsx } from "@/lib/spreadsheet";
import { parseBoardReport, boardSummary, cabinetTypeTally, isEmptyBoardReport } from "@/lib/cadmaster";
import { deriveHardware, type HardwareRule } from "@/lib/hardware-rules";
import { diffRequirements, diffSummary, type Requirement } from "@/lib/hardware-order";
import { loadRequirements } from "@/lib/hardware-order-server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// A board report for a whole kitchen is tens of kilobytes of XML in a zip; this
// is generous for a house-lot export and far below anything that would strain
// the box.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Read an uploaded board report and say what it would mean — without writing
 * anything.
 *
 * The preview *is* the safety model. The rules guess (that this panel code is a
 * door, that this cabinet takes four legs), and a revised report replaces what
 * came before it, so a revision that quietly dropped three cabinets would
 * otherwise go unnoticed until the order arrived short. Nothing is committed
 * until a person has seen the difference and pressed the button.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Invalid upload." }, 400);
  const file = form.getAll("file").find((f): f is File => f instanceof File);
  if (!file) return json({ error: "Upload a board report (.xlsx or .csv)." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "That file is too large (10 MB max)." }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Format comes from the bytes, not the filename — someone will eventually
  // rename a CSV to .xlsx or email one with no extension at all.
  const grid = await readSheetGrid(bytes).catch(() => null);
  if (!grid) {
    return json(
      { error: looksLikeXlsx(bytes) ? "That workbook couldn't be read." : "That file couldn't be read as a spreadsheet." },
      400
    );
  }

  const report = parseBoardReport(grid);
  if (isEmptyBoardReport(report)) {
    return json(
      { error: "No cabinets found in that file — is it a CADMaster board report?" },
      400
    );
  }

  const rules = (await prisma.hardwareRule.findMany()) as HardwareRule[];
  const derived = deriveHardware(report, rules);

  // Only derived rows are replaced by an import; anything added by hand stays,
  // because nothing in a CAD file knows about it. The diff is computed against
  // the derived rows alone so a manual line never reads as "removed".
  const existing = await prisma.jobHardware.findMany({
    where: { jobId, source: "derived" },
    select: { hardwareItemId: true, requiredPieces: true, pickedPieces: true },
  });
  const before: Requirement[] = existing.map((r) => ({
    hardwareItemId: r.hardwareItemId,
    requiredPieces: r.requiredPieces,
    pickedPieces: r.pickedPieces,
  }));
  const after: Requirement[] = derived.lines.map((l) => ({
    hardwareItemId: l.hardwareItemId,
    // Pieces are whole things. A fractional rule ("half a pack per door") would
    // otherwise round down silently and under-order.
    requiredPieces: Math.ceil(l.qty),
    pickedPieces: 0,
  }));

  const changes = diffRequirements(before, after);

  // Names for everything referenced, so the preview reads as hardware rather
  // than as a list of ids.
  const ids = [...new Set([...before, ...after].map((r) => r.hardwareItemId))];
  const items = await prisma.hardwareItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true, unit: true, packSize: true, piecesPerPack: true },
  });

  return json({
    report: {
      accountName: report.accountName,
      summary: boardSummary(report),
      cabinetTypes: cabinetTypeTally(report),
      warnings: report.warnings,
    },
    derived: {
      lines: derived.lines,
      // The loud part: cabinet types no rule matched, and rules that caught
      // nothing. Both are shown before anything is saved.
      unmatched: derived.unmatched,
      unusedRuleIds: derived.unusedRuleIds,
    },
    requirements: after,
    changes,
    changeSummary: diffSummary(changes),
    items,
  });
}

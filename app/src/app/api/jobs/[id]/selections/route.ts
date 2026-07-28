import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";
import { mergeWithSlots, parseSelections, type SelectionEntry } from "@/lib/selections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type Row = {
  id: string;
  slot: string;
  label: string;
  brand: string;
  code: string;
  colour: string;
  finish: string;
  supplier: string;
  notes: string;
  photoId: string | null;
  position: number;
};

function toEntry(row: Row): SelectionEntry {
  return {
    id: row.id,
    slot: row.slot,
    label: row.label,
    brand: row.brand,
    code: row.code,
    colour: row.colour,
    finish: row.finish,
    supplier: row.supplier,
    notes: row.notes,
    photoId: row.photoId,
    position: row.position,
  };
}

async function readSelections(jobId: string): Promise<SelectionEntry[]> {
  const rows = await prisma.selection.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  // Merged on the way out, so a job saved before a slot existed still shows it.
  return mergeWithSlots(rows.map(toEntry));
}

/** Anyone signed in may read a job's selections — the factory needs them too. */
export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);
  return json({ selections: await readSelections(jobId) });
}

/**
 * Replace the whole set for a job.
 *
 * Wholesale replacement rather than per-row patching: the editor always holds
 * the complete set, and a replace is naturally idempotent, so an offline save
 * replayed twice lands the same state instead of duplicating rows. Blank rows
 * aren't stored at all — an untouched slot is reproduced by mergeWithSlots on
 * read, so the table only ever holds decisions somebody actually made.
 */
export async function PUT(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const incoming = mergeWithSlots(parseSelections((body as { selections?: unknown }).selections));
  const toStore = incoming.filter(
    (s) => s.brand || s.code || s.colour || s.finish || s.supplier || s.notes || s.photoId
  );

  await prisma.$transaction([
    prisma.selection.deleteMany({ where: { jobId } }),
    ...toStore.map((s) =>
      prisma.selection.create({
        data: {
          jobId,
          slot: s.slot,
          label: s.label,
          brand: s.brand,
          code: s.code,
          colour: s.colour,
          finish: s.finish,
          supplier: s.supplier,
          notes: s.notes,
          photoId: s.photoId,
          position: s.position,
        },
      })
    ),
  ]);

  return json({ selections: await readSelections(jobId) });
}

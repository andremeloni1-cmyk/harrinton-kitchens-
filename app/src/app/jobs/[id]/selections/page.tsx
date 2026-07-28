import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import {
  GROUP_LABELS,
  mergeWithSlots,
  parseSelections,
  isFilled,
  slotDef,
  slotLabel,
  type SelectionEntry,
  type SelectionGroup,
} from "@/lib/selections";

export const dynamic = "force-dynamic";

// The workshop spec sheet: what the client chose, on one page, on paper.
// Follows the hardware-label sheet's pattern — an ordinary page that prints
// cleanly — rather than generating a PDF, because this gets stuck to a bench,
// not emailed.
export default async function SelectionsSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      title: true,
      address: true,
      clientName: true,
      clientPhone: true,
      clientEmail: true,
      selections: { orderBy: { position: "asc" } },
    },
  });
  if (!job) notFound();

  const rows = mergeWithSlots(parseSelections(job.selections));
  const chosen = rows.filter(isFilled);

  function group(g: SelectionGroup): SelectionEntry[] {
    return chosen.filter((r) => slotDef(r.slot)?.group === g);
  }
  const custom = chosen.filter((r) => slotDef(r.slot) === null);

  return (
    <div className="px-4 pt-6 print:px-0 print:pt-0">
      <header className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Selections sheet</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">Print for the workshop.</p>
        </div>
        <PrintButton />
      </header>
      <Link
        href={`/jobs/${job.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 print:hidden dark:text-slate-400"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to job
      </Link>

      <div className="rounded-xl border border-stone-300 bg-white p-5 text-stone-900 print:rounded-none print:border-0 print:p-0">
        <div className="border-b border-stone-300 pb-3">
          <p className="font-mono text-[11px] font-bold tracking-wider text-stone-500">{job.reference}</p>
          <h2 className="text-xl font-bold leading-tight">{job.title}</h2>
          <p className="mt-1 text-sm text-stone-600">
            {[job.clientName, job.clientPhone, job.clientEmail].filter(Boolean).join(" · ") || "No client contact recorded"}
          </p>
          {job.address && <p className="text-sm text-stone-600">{job.address}</p>}
        </div>

        {chosen.length === 0 ? (
          <p className="pt-4 text-sm text-stone-500">Nothing has been chosen yet.</p>
        ) : (
          <>
            {(["colour", "hardware"] as SelectionGroup[]).map((g) =>
              group(g).length === 0 ? null : (
                <Section key={g} title={GROUP_LABELS[g]} rows={group(g)} />
              )
            )}
            {custom.length > 0 && <Section title="Other" rows={custom} />}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: SelectionEntry[] }) {
  return (
    <div className="pt-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">{title}</p>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || `${r.slot}-${i}`} className="break-inside-avoid border-b border-stone-200 align-top">
              <th scope="row" className="w-32 py-2 pr-3 text-left font-bold">
                {slotLabel(r)}
              </th>
              <td className="py-2">
                <span className="font-medium">{[r.brand, r.code].filter(Boolean).join(" ") || "—"}</span>
                {(r.colour || r.finish) && (
                  <span className="text-stone-600"> · {[r.colour, r.finish].filter(Boolean).join(", ")}</span>
                )}
                {r.supplier && <span className="text-stone-500"> · {r.supplier}</span>}
                {r.notes && <div className="mt-0.5 text-[13px] text-stone-500">{r.notes}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

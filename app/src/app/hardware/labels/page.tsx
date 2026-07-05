import QRCode from "qrcode";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Printable QR label sheet — one label per stock line. Print on A4 (or an
// Avery-style sticker sheet), cut, and stick on the box/bin. The QR encodes
// the item's action URL, so any phone camera opens it directly.
export default async function HardwareLabelsPage() {
  const items = await prisma.hardwareItem.findMany({ orderBy: { code: "asc" } });
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  const labels = await Promise.all(
    items.map(async (i) => ({
      ...i,
      qr: await QRCode.toString(`${base}/hardware/item/${i.code}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#1c1917", light: "#ffffff" },
      }),
    }))
  );

  return (
    <div className="px-4 pt-6 print:px-0 print:pt-0">
      <header className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Hardware labels</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            Print, cut, and stick on the box or bin — any phone camera opens the item.
          </p>
        </div>
        <PrintButton />
      </header>
      <Link href="/hardware" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 print:hidden dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to hardware
      </Link>

      {labels.length === 0 ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">No hardware lines yet — add some first.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-[4mm]">
          {labels.map((i) => (
            <div
              key={i.id}
              className="break-inside-avoid rounded-xl border border-stone-300 bg-white p-3 text-stone-900 print:rounded-none print:border-dashed"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-20 w-20 shrink-0" dangerouslySetInnerHTML={{ __html: i.qr }} />
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold tracking-wider">{i.code}</p>
                  <p className="mt-0.5 text-[13px] font-bold leading-tight">{i.name}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-stone-500">
                    {[i.packSize, i.location ? `Bay ${i.location}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <p className="mt-2 border-t border-dashed border-stone-300 pt-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-stone-400">
                Scan to book in delivery / reorder
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

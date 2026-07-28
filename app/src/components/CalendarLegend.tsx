"use client";

import type { LegendEntry } from "@/lib/colors";

/**
 * The colour key for whatever is currently on screen.
 *
 * It carries labels, not just swatches, on purpose: past ten companies the
 * palette has to repeat, and colour alone also fails in glare on a site phone
 * or for a colour-blind user. The text is what actually resolves it.
 */
export function CalendarLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        Colour key
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {entries.map((entry) => (
          <span
            key={entry.key}
            className="inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-300"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${entry.palette.swatch}`} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

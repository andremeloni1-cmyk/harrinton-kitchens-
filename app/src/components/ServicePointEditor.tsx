"use client";

import {
  emptyServicePoint,
  SERVICE_KINDS,
  SERVICE_LABELS,
  type ServiceKind,
  type ServicePoint,
} from "@/lib/measure";
import { SERVICE_CODE } from "@/lib/measure-ref";

/** A dot colour per service, so a row is identifiable at a glance on site. */
export const SERVICE_TONE: Record<ServiceKind, { dot: string; chip: string }> = {
  power: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" },
  water: { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300" },
  waste: { dot: "bg-stone-500", chip: "bg-stone-100 text-stone-700 dark:bg-night-800 dark:text-slate-300" },
  gas: { dot: "bg-orange-600", chip: "bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300" },
  data: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300" },
};

function newId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function MmInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: number | null;
  onChange: (mm: number | null) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      className="input w-full text-right tabular-nums"
      type="number"
      inputMode="numeric"
      step="1"
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

/**
 * Where the power points, taps and drains actually are.
 *
 * This is the part of a check measure that costs money to get wrong: a cabinet
 * built over a waste, an island with no power, a splashback GPO that lands
 * behind a wall oven. Positions are captured the same way openings are — which
 * wall, how far along it — plus a height, because a GPO's height decides
 * whether it clears the benchtop.
 *
 * Nothing is required. A point recorded with a label and nothing else is still
 * a point, and forcing a position on someone who only knows "there's a tap
 * under the window" would just get a made-up number typed in.
 */
export function ServicePointEditor({
  points,
  wallLabels,
  refs,
  onChange,
}: {
  points: ServicePoint[];
  /** The room's walls, so a point can be pinned to one. */
  wallLabels: string[];
  /** The cross-reference for each point, by point id. Empty before a ref exists. */
  refs: Record<string, string>;
  onChange: (points: ServicePoint[]) => void;
}) {
  const patch = (id: string, p: Partial<ServicePoint>) =>
    onChange(points.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = (kind: ServiceKind) => onChange([...points, emptyServicePoint(newId("sp"), kind)]);

  return (
    <div>
      <div className="mb-1.5">
        <p className="text-sm font-medium text-stone-700 dark:text-slate-200">Power, water &amp; services</p>
        <p className="text-xs text-stone-400 dark:text-slate-500">
          Pin each one to a wall and how far along it, so the plan can place it.
        </p>
      </div>

      <div className="space-y-2">
        {points.map((point) => {
          const tone = SERVICE_TONE[point.kind];
          return (
            <div key={point.id} className="rounded-xl bg-stone-50 p-2.5 dark:bg-night-850">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                <select
                  className="input w-[104px] shrink-0 text-sm"
                  aria-label="Service"
                  value={point.kind}
                  onChange={(e) => patch(point.id, { kind: e.target.value as ServiceKind })}
                >
                  {SERVICE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {SERVICE_LABELS[k]}
                    </option>
                  ))}
                </select>
                <input
                  className="input min-w-0 flex-1"
                  aria-label="Description"
                  value={point.label}
                  placeholder={point.kind === "power" ? "e.g. behind the fridge" : "e.g. sink mixer"}
                  onChange={(e) => patch(point.id, { label: e.target.value })}
                />
                <button
                  className="px-1.5 text-stone-400 hover:text-red-600"
                  aria-label={`Remove ${refs[point.id] || point.label || "service point"}`}
                  onClick={() => onChange(points.filter((x) => x.id !== point.id))}
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  className="input min-w-0 flex-1 text-sm"
                  aria-label="Wall"
                  value={point.wall || ""}
                  onChange={(e) => patch(point.id, { wall: e.target.value || undefined })}
                >
                  <option value="">Which wall?</option>
                  {wallLabels.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <div className="w-24">
                  <MmInput
                    value={point.offsetMm}
                    placeholder="along"
                    label="Distance along the wall in mm"
                    onChange={(mm) => patch(point.id, { offsetMm: mm })}
                  />
                </div>
                <div className="w-24">
                  <MmInput
                    value={point.heightMm}
                    placeholder="height"
                    label="Height off the floor in mm"
                    onChange={(mm) => patch(point.id, { heightMm: mm })}
                  />
                </div>
                <span className="w-[22px] shrink-0" aria-hidden />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {point.kind === "power" && (
                  <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
                    Outlets
                    <input
                      className="input w-14 text-right tabular-nums"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={point.qty}
                      onChange={(e) => patch(point.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-stone-300"
                    checked={!point.existing}
                    onChange={(e) => patch(point.id, { existing: !e.target.checked })}
                  />
                  To be provided
                </label>
                {refs[point.id] && (
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${tone.chip}`}>
                    {refs[point.id]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SERVICE_KINDS.map((kind) => (
          <button
            key={kind}
            className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600 transition hover:bg-stone-200 dark:bg-night-800 dark:text-slate-300"
            onClick={() => add(kind)}
          >
            + {SERVICE_LABELS[kind]}
            <span className="ml-1 text-stone-400 dark:text-slate-500">{SERVICE_CODE[kind]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

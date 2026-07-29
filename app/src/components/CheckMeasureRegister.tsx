"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { EmptyState } from "@/components/EmptyState";
import { SERVICE_TONE } from "@/components/ServicePointEditor";
import { measurePhotoUrl } from "@/components/RoomPhotos";
import { fmtDay } from "@/lib/format";
import { SERVICE_LABELS, serviceCounts, servicePosition, type Room, type ServiceKind } from "@/lib/measure";
import { photoRef, refServicePoints } from "@/lib/measure-ref";
import {
  searchRegister,
  registerTotals,
  orphanedPhotos,
  type RegisterEntry,
} from "@/lib/measure-register";

type StatusFilter = "all" | "draft" | "complete";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "In progress" },
  { key: "complete", label: "Complete" },
];

/**
 * The check-measure register — every measure taken, searchable by reference.
 *
 * This is the cross-reference surface: the place you come back to when a
 * dimension is disputed, an installer rings from site, or a client wants a
 * matching laundry two years later. It shows what was captured rather than
 * what is outstanding — the queue beside it already does outstanding.
 */
export function CheckMeasureRegister() {
  const [entries, setEntries] = useState<RegisterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // Only the last explicit open/close is held. Which card is open is otherwise
  // derived from the search, so narrowing to one result opens it without an
  // effect racing the render that produced the result.
  const [toggled, setToggled] = useState<{ ref: string; open: boolean } | null>(null);

  useEffect(() => {
    api<{ measures: RegisterEntry[] }>("/api/design/measures")
      .then((r) => setEntries(r.measures))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    const byStatus = status === "all" ? entries : entries.filter((e) => e.status === status);
    return searchRegister(byStatus, query);
  }, [entries, query, status]);

  // Narrowing to a single measure opens it — searching by a room reference
  // should land on that room, not on a card you still have to tap.
  const autoOpen = matches.length === 1 ? matches[0].entry.ref : null;
  const isOpen = (ref: string) => (toggled?.ref === ref ? toggled.open : ref === autoOpen);

  return (
    <div>
      <div className="mb-3">
        <input
          className="input w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search CM-1042, a client, an address, a room…"
          aria-label="Search the check-measure register"
          autoComplete="off"
        />
        <p className="mt-1 px-1 text-[11px] text-stone-400 dark:text-slate-500">
          A full reference jumps straight to it — <span className="font-semibold tabular-nums">CM-1042-R2</span> opens
          that room.
        </p>
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              status === f.key
                ? "bg-brand-600 text-white"
                : "bg-stone-100 text-stone-600 dark:bg-night-800 dark:text-slate-300"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 ${status === f.key ? "text-white/70" : "text-stone-400 dark:text-slate-500"}`}>
              {f.key === "all" ? entries.length : entries.filter((e) => e.status === f.key).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">Loading…</p>
      ) : matches.length === 0 ? (
        <EmptyState
          title={query ? "Nothing matches that" : "No check measures yet"}
          subtitle={
            query
              ? "Try a client name, an address, or the reference off the site sheet."
              : "A measure appears here the moment someone opens the capture form on a job."
          }
        />
      ) : (
        <div className="space-y-3">
          {matches.map(({ entry, roomIndex }) => (
            <MeasureCard
              key={entry.ref}
              entry={entry}
              open={isOpen(entry.ref)}
              highlightRoom={roomIndex}
              onToggle={() => setToggled({ ref: entry.ref, open: !isOpen(entry.ref) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeasureCard({
  entry,
  open,
  highlightRoom,
  onToggle,
}: {
  entry: RegisterEntry;
  open: boolean;
  highlightRoom: number | null;
  onToggle: () => void;
}) {
  const totals = registerTotals(entry);
  const orphans = orphanedPhotos(entry);
  const complete = entry.status === "complete";

  return (
    <div className="card overflow-hidden">
      <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold tabular-nums text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {entry.ref}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                complete
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              {complete ? "Complete" : "In progress"}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-bold text-stone-900 dark:text-slate-100">{entry.title}</p>
          <p className="truncate text-xs text-stone-500 dark:text-slate-400">
            {entry.jobReference}
            {entry.clientName ? ` · ${entry.clientName}` : ""}
          </p>
          {entry.address && <p className="truncate text-xs text-stone-400 dark:text-slate-500">📍 {entry.address}</p>}
        </div>
        <span className={`shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[11px] font-semibold text-stone-500 dark:text-slate-400">
        <span>
          {totals.rooms} room{totals.rooms === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">{totals.walls} walls</span>
        <span className="tabular-nums">{totals.openings} openings</span>
        {(Object.keys(totals.services) as ServiceKind[])
          .filter((k) => totals.services[k] > 0)
          .map((k) => (
            <span key={k} className={`rounded-full px-1.5 py-0.5 tabular-nums ${SERVICE_TONE[k].chip}`}>
              {totals.services[k]} {SERVICE_LABELS[k].toLowerCase()}
            </span>
          ))}
        {totals.photos > 0 && <span className="tabular-nums">📷 {totals.photos}</span>}
        {totals.toBeProvided > 0 && (
          <span className="text-amber-700 dark:text-amber-300">{totals.toBeProvided} to be provided</span>
        )}
      </div>

      {open && (
        <div className="border-t border-stone-100 px-4 py-4 dark:border-night-line">
          <p className="mb-3 text-xs text-stone-500 dark:text-slate-400">
            {entry.measuredByName ? `Measured by ${entry.measuredByName}` : "Not signed off yet"}
            {entry.completedAt ? ` · completed ${fmtDay(entry.completedAt)}` : ""}
            {` · last saved ${fmtDay(entry.updatedAt)}`}
          </p>

          {entry.data.rooms.length === 0 ? (
            <p className="text-sm text-stone-400 dark:text-slate-500">Nothing captured against this reference yet.</p>
          ) : (
            <div className="space-y-4">
              {entry.data.rooms.map((room, i) => (
                <RoomDetail
                  key={room.id}
                  jobId={entry.jobId}
                  cmRef={entry.ref}
                  room={room}
                  index={i}
                  highlight={highlightRoom === i}
                />
              ))}
            </div>
          )}

          {orphans.length > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {orphans.length} photo{orphans.length === 1 ? "" : "s"} on this job aren&apos;t attached to a room — open
              the measure to file {orphans.length === 1 ? "it" : "them"}.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3 dark:border-night-line">
            <Link href={`/jobs/${entry.jobId}/measure`} className="btn-primary text-sm">
              Open the measure
            </Link>
            <Link href={`/jobs/${entry.jobId}`} className="btn-secondary text-sm">
              Open the job
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomDetail({
  jobId,
  cmRef,
  room,
  index,
  highlight,
}: {
  jobId: string;
  cmRef: string;
  room: Room;
  index: number;
  highlight: boolean;
}) {
  const counts = serviceCounts(room);
  const pointRefs = useMemo(() => {
    const map: Record<string, string> = {};
    for (const { ref, pointId } of refServicePoints(cmRef, index, room)) map[pointId] = ref;
    return map;
  }, [cmRef, index, room]);

  return (
    <div
      className={`rounded-xl p-3 ${
        highlight ? "bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-500/10" : "bg-stone-50 dark:bg-night-850"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-bold text-stone-900 dark:text-slate-100">{room.name}</p>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-stone-400 dark:text-slate-500">
          {`${cmRef}-R${index + 1}`}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {room.ceilingMm != null && <Fact label="Ceiling" value={`${room.ceilingMm} mm`} />}
        {room.walls
          .filter((w) => w.mm != null)
          .map((w, i) => (
            <Fact key={`w${i}`} label={w.label || `Wall ${String.fromCharCode(65 + i)}`} value={`${w.mm} mm`} />
          ))}
        {room.openings
          .filter((o) => o.mm != null)
          .map((o, i) => (
            <Fact
              key={`o${i}`}
              label={o.label || "Opening"}
              value={`${o.mm} mm${o.wall ? ` · ${o.wall}${o.offsetMm != null ? ` @ ${o.offsetMm}` : ""}` : ""}`}
            />
          ))}
      </dl>

      {room.servicePoints.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-stone-200 pt-2 dark:border-night-line">
          {room.servicePoints.map((point) => {
            const where = servicePosition(point);
            return (
              <li key={point.id} className="flex items-baseline gap-2 text-xs">
                <span
                  className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${SERVICE_TONE[point.kind].dot}`}
                  aria-hidden
                />
                <span className="shrink-0 font-semibold text-stone-700 dark:text-slate-200">
                  {SERVICE_LABELS[point.kind]}
                  {point.kind === "power" && point.qty > 1 ? ` ×${point.qty}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-stone-500 dark:text-slate-400">
                  {[point.label, where].filter(Boolean).join(" — ") || "No position captured"}
                  {point.existing ? "" : " · to be provided"}
                </span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-stone-400 dark:text-slate-500">
                  {pointRefs[point.id]}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {room.photoIds.length > 0 && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto border-t border-stone-200 pt-2 dark:border-night-line">
          {room.photoIds.map((id, i) => (
            <a
              key={id}
              href={measurePhotoUrl(jobId, id)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0"
              title={photoRef(cmRef, index, i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={measurePhotoUrl(jobId, id)}
                alt={photoRef(cmRef, index, i)}
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-stone-200 dark:ring-night-line"
              />
              <span className="mt-0.5 block text-center text-[9px] font-semibold tabular-nums text-stone-400 dark:text-slate-500">
                IMG{i + 1}
              </span>
            </a>
          ))}
        </div>
      )}

      {(room.appliances.trim() || room.notes.trim() || counts.power + counts.water === 0) && (
        <div className="mt-2 space-y-0.5 text-xs text-stone-500 dark:text-slate-400">
          {room.appliances.trim() && (
            <p>
              <span className="font-semibold">Appliances:</span> {room.appliances.split("\n").join(", ")}
            </p>
          )}
          {room.notes.trim() && (
            <p>
              <span className="font-semibold">Notes:</span> {room.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</dt>
      <dd className="truncate font-semibold tabular-nums text-stone-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

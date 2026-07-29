"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { queueMutation } from "@/lib/offline-queue";
import { DictateButton } from "@/components/DictateButton";
import { MudmapAndPlan } from "@/components/MudmapAndPlan";
import { MeasureImport } from "@/components/MeasureImport";
import { ServicePointEditor } from "@/components/ServicePointEditor";
import { RoomPhotos, type MeasurePhoto } from "@/components/RoomPhotos";
import {
  emptyRoom,
  parseMeasure,
  roomSummary,
  type Room,
  type Measurement,
  type ServicePoint,
} from "@/lib/measure";
import { refServicePoints, roomRef } from "@/lib/measure-ref";

type SaveState = "idle" | "saving" | "saved" | "offline";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `room-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

// A number input that stores mm (or null when blank).
function MmInput({ value, onChange, placeholder }: { value: number | null; onChange: (mm: number | null) => void; placeholder?: string }) {
  return (
    <input
      className="input w-full text-right tabular-nums"
      type="number"
      inputMode="numeric"
      step="1"
      placeholder={placeholder || "mm"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

export function MeasureForm({ jobId }: { jobId: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cmRef, setCmRef] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, MeasurePhoto>>({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [proposal, setProposal] = useState<Room[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeResult, setCompleteResult] = useState<{ discrepancies: { note: string }[]; variationId: string | null } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ measure: { ref: string | null; data: { rooms: unknown[] } } }>(`/api/jobs/${jobId}/measure`)
      .then((r) => {
        const parsed = parseMeasure(JSON.stringify(r.measure.data));
        setCmRef(r.measure.ref);
        setRooms(parsed.rooms);
        if (parsed.rooms[0]) setOpenId(parsed.rooms[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // The photo index is separate from the measure so a thumbnail knows its
    // filename; a failure here only costs the alt text, so it stays quiet.
    api<{ photos: MeasurePhoto[] }>(`/api/jobs/${jobId}/measure/photos`)
      .then((r) => setPhotos(Object.fromEntries(r.photos.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [jobId]);

  const save = useCallback(
    async (next: Room[]) => {
      setSaveState("saving");
      const body = { data: { rooms: next } };
      try {
        await api(`/api/jobs/${jobId}/measure`, { method: "PATCH", body: JSON.stringify(body) });
        setSaveState("saved");
      } catch {
        // Offline — queue it; the app replays queued mutations on reconnect.
        await queueMutation(`/api/jobs/${jobId}/measure`, "PATCH", body).catch(() => {});
        window.dispatchEvent(new CustomEvent("jf-offline-queued"));
        setSaveState("offline");
      }
    },
    [jobId]
  );

  const mutate = useCallback(
    (fn: (rooms: Room[]) => Room[]) => {
      setRooms((prev) => {
        const next = fn(structuredClone(prev));
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => save(next), 800);
        return next;
      });
    },
    [save]
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const patchRoom = (id: string, patch: Partial<Room>) => mutate((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoom = () => { const r = emptyRoom(newId(), `Room ${rooms.length + 1}`); mutate((rs) => [...rs, r]); setOpenId(r.id); };
  const removeRoom = (id: string) => mutate((rs) => rs.filter((r) => r.id !== id));

  const setMeasurements = (id: string, key: "walls" | "openings", list: Measurement[]) => patchRoom(id, { [key]: list } as Partial<Room>);

  // Every room's cross-reference, and every service point's within it. Derived
  // from position, so the refs on screen are the same ones the plan and the
  // register print — there is no second source of truth to drift.
  const refsByRoom = useMemo(() => {
    const out: Record<string, { room: string; points: Record<string, string> }> = {};
    rooms.forEach((room, i) => {
      if (!cmRef) return;
      const points: Record<string, string> = {};
      for (const { ref, pointId } of refServicePoints(cmRef, i, room)) points[pointId] = ref;
      out[room.id] = { room: roomRef(cmRef, i), points };
    });
    return out;
  }, [rooms, cmRef]);

  // Imported rooms append rather than replace: a measure is usually part typed,
  // part pasted, and silently dropping what was already there would be the one
  // unrecoverable thing this screen could do.
  async function importRooms(imported: Room[]) {
    setImporting(true);
    try {
      mutate((rs) => [...rs, ...imported]);
      if (imported[0]) setOpenId(imported[0].id);
      setAiMsg(null);
    } finally {
      setImporting(false);
    }
  }

  // AI site-sheet reader — reads a photo into proposed rooms for review; the
  // user merges them in, nothing auto-commits.
  async function readSheet(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    setAiMsg(null);
    setProposal(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files).slice(0, 4)) fd.append("photos", f);
      const res = await fetch(`/api/jobs/${jobId}/measure/read`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setAiMsg(body.error || "Couldn't read the sheet."); return; }
      if (!body.rooms) { setAiMsg(body.message || "Couldn't read the sheet."); return; }
      setProposal(parseMeasure(JSON.stringify({ rooms: body.rooms })).rooms);
    } catch {
      setAiMsg("Couldn't read the sheet — check your connection and try again.");
    } finally {
      setReading(false);
      if (sheetInput.current) sheetInput.current.value = "";
    }
  }

  function mergeProposal() {
    if (!proposal) return;
    const withIds = proposal.map((r) => ({ ...r, id: newId() }));
    mutate((rs) => [...rs, ...withIds]);
    if (withIds[0]) setOpenId(withIds[0].id);
    setProposal(null);
    setAiMsg(null);
  }

  async function complete() {
    setCompleting(true);
    setAiMsg(null);
    try {
      // Make sure the latest edits are saved before diffing against the quote.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await save(rooms);
      const res = await api<{ discrepancies: { note: string }[]; variationId: string | null }>(
        `/api/jobs/${jobId}/measure/complete`,
        { method: "POST" }
      );
      setCompleteResult(res);
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : "Couldn't complete the check measure.");
    } finally {
      setCompleting(false);
    }
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;

  return (
    <div className="px-4 pt-5 pb-4">
      <Link href={`/jobs/${jobId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back to job
      </Link>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">Check measure</h1>
          {cmRef && (
            <p className="text-xs text-stone-500 dark:text-slate-400">
              <span className="font-bold tabular-nums text-brand-600">{cmRef}</span> — write this on the site sheet
            </p>
          )}
        </div>
        <SaveChip state={saveState} />
      </div>

      <div className="space-y-3">
        {rooms.map((room, roomIndex) => {
          const open = openId === room.id;
          const roomRefs = refsByRoom[room.id];
          return (
            <div key={room.id} className="card overflow-hidden">
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : room.id)}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{room.name || "Untitled room"}</p>
                  <p className="truncate text-xs text-stone-400 dark:text-slate-500">{roomSummary(room)}</p>
                </div>
                {roomRefs && (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-stone-500 dark:bg-night-800 dark:text-slate-400">
                    {roomRefs.room}
                  </span>
                )}
                <span className={`shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
              </button>

              {open && (
                <div className="space-y-4 border-t border-stone-100 px-4 py-4 dark:border-night-line">
                  <Field label="Room name">
                    <input className="input" value={room.name} onChange={(e) => patchRoom(room.id, { name: e.target.value })} placeholder="e.g. Kitchen" />
                  </Field>

                  <Field label="Ceiling height (mm)">
                    <MmInput value={room.ceilingMm} onChange={(mm) => patchRoom(room.id, { ceilingMm: mm })} />
                  </Field>

                  <MeasureList
                    title="Walls"
                    addLabel="Add wall"
                    defaultLabel={(n) => `Wall ${String.fromCharCode(65 + n)}`}
                    items={room.walls}
                    onChange={(list) => setMeasurements(room.id, "walls", list)}
                  />
                  <MeasureList
                    title="Openings (doors / windows)"
                    addLabel="Add opening"
                    defaultLabel={() => "Opening"}
                    items={room.openings}
                    onChange={(list) => setMeasurements(room.id, "openings", list)}
                    // Which wall, and how far along it — optional, and only
                    // worth filling in when the sketch actually shows it. The
                    // drawn plan places the ones that have it.
                    wallLabels={room.walls.map((w, i) => w.label || `Wall ${String.fromCharCode(65 + i)}`)}
                  />

                  <ServicePointEditor
                    points={room.servicePoints}
                    wallLabels={room.walls.map((w, i) => w.label || `Wall ${String.fromCharCode(65 + i)}`)}
                    refs={roomRefs?.points ?? {}}
                    onChange={(list: ServicePoint[]) => patchRoom(room.id, { servicePoints: list })}
                  />

                  <RoomPhotos
                    jobId={jobId}
                    cmRef={cmRef}
                    roomIndex={roomIndex}
                    photoIds={room.photoIds}
                    photos={photos}
                    onChange={(ids) => patchRoom(room.id, { photoIds: ids })}
                    onUploaded={(photo) => setPhotos((prev) => ({ ...prev, [photo.id]: photo }))}
                  />

                  {/* The free-text service notes this screen used before points
                      were positioned. Kept editable so nothing captured on an
                      older measure is stranded, but folded away by default. */}
                  <details open={Boolean(room.services.power || room.services.water || room.services.gas)}>
                    <summary className="cursor-pointer text-sm font-medium text-stone-500 dark:text-slate-400">
                      Service notes (free text)
                    </summary>
                    <div className="mt-2 space-y-2">
                      <ServiceInput label="Power" value={room.services.power} onChange={(v) => patchRoom(room.id, { services: { ...room.services, power: v } })} />
                      <ServiceInput label="Water" value={room.services.water} onChange={(v) => patchRoom(room.id, { services: { ...room.services, water: v } })} />
                      <ServiceInput label="Gas" value={room.services.gas} onChange={(v) => patchRoom(room.id, { services: { ...room.services, gas: v } })} />
                    </div>
                  </details>

                  <Field label="Appliances (one per line)">
                    <textarea className="input min-h-[70px] resize-y" value={room.appliances} onChange={(e) => patchRoom(room.id, { appliances: e.target.value })} placeholder="Oven&#10;Dishwasher&#10;Rangehood" />
                  </Field>

                  <Field label="Notes">
                    <textarea className="input min-h-[70px] resize-y" value={room.notes} onChange={(e) => patchRoom(room.id, { notes: e.target.value })} placeholder="Anything worth noting on site…" />
                    <div className="mt-1.5">
                      <DictateButton onText={(t) => patchRoom(room.id, { notes: (room.notes ? room.notes + " " : "") + t })} />
                    </div>
                  </Field>

                  <button className="btn-ghost text-sm text-red-600" onClick={() => removeRoom(room.id)}>Remove room</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI review panel — proposed rooms from a photographed sheet */}
      {proposal && (
        <div className="card mt-4 border-l-4 border-brand-400 p-4">
          <p className="font-semibold text-stone-900 dark:text-slate-100">AI read {proposal.length} room{proposal.length === 1 ? "" : "s"} — review before adding</p>
          <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-slate-300">
            {proposal.map((r, i) => (
              <li key={i}><span className="font-medium">{r.name}</span> — {roomSummary(r)}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button className="btn-accent flex-1" onClick={mergeProposal}>Add {proposal.length === 1 ? "room" : `${proposal.length} rooms`}</button>
            <button className="btn-ghost" onClick={() => setProposal(null)}>Discard</button>
          </div>
        </div>
      )}
      {aiMsg && !proposal && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{aiMsg}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-accent flex-1" onClick={addRoom}>+ Add room</button>
        <button className="btn-secondary" disabled={reading} onClick={() => sheetInput.current?.click()}>
          {reading ? "Reading…" : "✨ Read a site sheet"}
        </button>
        <input ref={sheetInput} type="file" accept="image/*" multiple hidden onChange={(e) => readSheet(e.target.files)} />
      </div>

      <div className="mt-3">
        <MeasureImport busy={importing} onImport={importRooms} />
      </div>

      {rooms.length === 0 && !proposal && (
        <p className="mt-3 text-center text-sm text-stone-400 dark:text-slate-500">
          Add a room by hand, paste dimensions in, or photograph a site sheet and let AI read it. Everything saves as
          you go — even offline.
        </p>
      )}

      {/* The sketch off site, and the plan drawn from what's above */}
      <MudmapAndPlan jobId={jobId} />

      {/* Complete — diffs against the quote, drafts a variation, moves to Design */}
      {rooms.length > 0 && (
        <div className="mt-6 border-t border-stone-100 pt-4 dark:border-night-line">
          {completeResult ? (
            <div className="card border-l-4 border-emerald-400 p-4">
              <p className="font-semibold text-stone-900 dark:text-slate-100">Check measure complete — moved to Design</p>
              {completeResult.discrepancies.length === 0 ? (
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">No discrepancies against the quote.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                    {completeResult.discrepancies.length} discrepanc{completeResult.discrepancies.length === 1 ? "y" : "ies"} vs the quote — a draft variation has been raised:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-stone-600 dark:text-slate-300">
                    {completeResult.discrepancies.map((d, i) => (<li key={i}>{d.note}</li>))}
                  </ul>
                </>
              )}
              <Link href={`/jobs/${jobId}`} className="btn-secondary mt-3 inline-flex">Back to job</Link>
            </div>
          ) : (
            <button className="btn-primary w-full" disabled={completing} onClick={complete}>
              {completing ? "Completing…" : "Complete check measure → Design"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MeasureList({
  title, addLabel, defaultLabel, items, onChange, wallLabels,
}: {
  title: string;
  addLabel: string;
  defaultLabel: (index: number) => string;
  items: Measurement[];
  onChange: (list: Measurement[]) => void;
  /** When given, each row also takes a wall and an offset along it. */
  wallLabels?: string[];
}) {
  const patch = (i: number, p: Partial<Measurement>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-slate-200">{title}</p>
      <div className="space-y-2">
        {items.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                value={m.label}
                placeholder="Label"
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <div className="w-28">
                <MmInput value={m.mm} onChange={(mm) => patch(i, { mm })} />
              </div>
              <button className="px-1.5 text-stone-400 hover:text-red-600" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
            </div>
            {wallLabels && wallLabels.length > 0 && (
              <div className="flex items-center gap-2 pl-1">
                <select
                  className="input flex-1 text-sm"
                  value={m.wall || ""}
                  onChange={(e) => patch(i, { wall: e.target.value || undefined })}
                >
                  <option value="">Which wall? (optional)</option>
                  {wallLabels.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <div className="w-28">
                  <MmInput
                    value={m.offsetMm ?? null}
                    placeholder="from start"
                    onChange={(mm) => patch(i, { offsetMm: mm })}
                  />
                </div>
                <span className="w-[22px] shrink-0" aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn-ghost mt-1.5 text-sm text-brand-600" onClick={() => onChange([...items, { label: defaultLabel(items.length), mm: null }])}>
        + {addLabel}
      </button>
    </div>
  );
}

function ServiceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-sm text-stone-500 dark:text-slate-400">{label}</span>
      <input className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Position / notes" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-slate-200">{label}</span>
      {children}
    </label>
  );
}

function SaveChip({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string }> = {
    idle: { text: "", cls: "" },
    saving: { text: "Saving…", cls: "bg-stone-100 text-stone-500 dark:bg-night-800 dark:text-slate-400" },
    saved: { text: "Saved", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
    offline: { text: "Saved offline — will sync", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  };
  const s = map[state];
  if (!s.text) return null;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.text}</span>;
}

// Searching the check-measure register.
//
// The register exists to answer questions asked long after the job: "what was
// the ceiling height at the Wilsons'", "which wall was the GPO on in CM-1042",
// "did we ever measure 12 Bourke St". So the search box takes three different
// kinds of input and works out which it was given:
//
//   CM-1042-R2   a reference — jump straight to that measure, and to that room
//   1042         a number — matches the job or the measure reference
//   bourke st    words — matches the client, address or job title
//
// Pure, so the matching is testable without a database or a browser.

import { parseMeasureRef, roomRef } from "./measure-ref";
import { serviceCounts, type CheckMeasureData, type ServiceKind } from "./measure";

export type RegisterEntry = {
  ref: string;
  jobId: string;
  jobReference: string;
  title: string;
  clientName: string | null;
  address: string | null;
  status: string;
  measuredByName: string;
  measuredAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  data: CheckMeasureData;
  photoIds: string[];
};

export type RegisterMatch = {
  entry: RegisterEntry;
  /** The room the query named, when it named one — for opening it directly. */
  roomIndex: number | null;
};

function haystack(entry: RegisterEntry): string {
  return [
    entry.ref,
    entry.jobReference,
    entry.title,
    entry.clientName ?? "",
    entry.address ?? "",
    entry.measuredByName,
    // Room names are searchable too: "butler's pantry" is how someone in the
    // office remembers a job they can't name any other way.
    ...entry.data.rooms.map((r) => r.name),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Filter the register by what was typed.
 *
 * A reference query is matched exactly against the measure's own reference
 * rather than by substring, because "CM-104" should not return CM-1042 when
 * the person clearly typed a reference — but a bare "104" still searches
 * loosely, which is what someone half-remembering a number wants.
 */
export function searchRegister(entries: RegisterEntry[], query: string): RegisterMatch[] {
  const q = (query || "").trim();
  if (!q) return entries.map((entry) => ({ entry, roomIndex: null }));

  const ref = parseMeasureRef(q);
  if (ref) {
    return entries
      .filter((e) => e.ref.toUpperCase() === ref.cmRef)
      .map((entry) => ({
        entry,
        // Only point at a room that actually exists — a ref for a room since
        // deleted should still find the measure.
        roomIndex: ref.roomIndex != null && ref.roomIndex < entry.data.rooms.length ? ref.roomIndex : null,
      }));
  }

  // Every word has to appear somewhere, so "smith kitchen" narrows rather than
  // widening the way an any-word match would.
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const hay = haystack(entry);
      return terms.every((t) => hay.includes(t));
    })
    .map((entry) => ({ entry, roomIndex: null }));
}

export type RegisterTotals = {
  rooms: number;
  walls: number;
  openings: number;
  services: Record<ServiceKind, number>;
  servicesTotal: number;
  photos: number;
  /** Service points still to be run by a trade — the outstanding work. */
  toBeProvided: number;
};

/** What a measure holds, counted up for its row in the register. */
export function registerTotals(entry: RegisterEntry): RegisterTotals {
  const services: Record<ServiceKind, number> = { power: 0, water: 0, waste: 0, gas: 0, data: 0 };
  let walls = 0;
  let openings = 0;
  let photos = 0;
  let toBeProvided = 0;

  for (const room of entry.data.rooms) {
    walls += room.walls.filter((w) => w.mm != null).length;
    openings += room.openings.filter((o) => o.mm != null).length;
    photos += room.photoIds.length;
    toBeProvided += room.servicePoints.filter((p) => !p.existing).length;
    const counts = serviceCounts(room);
    for (const kind of Object.keys(services) as ServiceKind[]) services[kind] += counts[kind];
  }

  const servicesTotal = Object.values(services).reduce((a, b) => a + b, 0);
  return { rooms: entry.data.rooms.length, walls, openings, services, servicesTotal, photos, toBeProvided };
}

/**
 * Photos uploaded against the job's measure that no room claims.
 *
 * These happen honestly — a photo uploaded to a room that was later deleted,
 * or an offline save that replayed after the upload. Surfacing the count means
 * the evidence isn't quietly orphaned; the measure is the record of record.
 */
export function orphanedPhotos(entry: RegisterEntry): string[] {
  const claimed = new Set(entry.data.rooms.flatMap((r) => r.photoIds));
  return entry.photoIds.filter((id) => !claimed.has(id));
}

/** Every room in a measure paired with its reference, for display. */
export function roomsWithRefs(entry: RegisterEntry) {
  return entry.data.rooms.map((room, i) => ({ room, ref: roomRef(entry.ref, i), index: i }));
}

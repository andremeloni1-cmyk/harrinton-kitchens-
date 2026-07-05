"use client";

// Offline-first work queue. Two things can be queued when the device has no
// signal and replayed automatically when it returns:
//   • photos — binary, stored in IndexedDB (localStorage can't hold blobs)
//   • mutations — JSON API writes (checklist ticks, notes), stored in IndexedDB
//
// Everything degrades gracefully: if IndexedDB is unavailable the callers just
// fall back to a live request.

const DB_NAME = "harringtonkitchens-offline";
const DB_VERSION = 1;
const PHOTOS = "photos";
const MUTATIONS = "mutations";

type PhotoJob = { id?: number; jobId: string; name: string; type: string; blob: Blob; queuedAt: number };
type Mutation = { id?: number; url: string; method: string; body: string; queuedAt: number };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(MUTATIONS)) db.createObjectStore(MUTATIONS, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(null);
      })
  );
}

async function getAll<T>(store: string): Promise<T[]> {
  return (await tx<T[]>(store, "readonly", (s) => s.getAll())) || [];
}

// ---- Photos ----------------------------------------------------------------

// Returns true only if the write actually persisted, so callers never claim a
// photo is "saved offline" when IndexedDB rejected it (quota/private mode).
export async function queuePhoto(jobId: string, file: File): Promise<boolean> {
  const key = await tx<IDBValidKey>(PHOTOS, "readwrite", (s) =>
    s.add({ jobId, name: file.name, type: file.type, blob: file, queuedAt: Date.now() } as PhotoJob)
  );
  return key != null;
}

export async function pendingPhotoCount(jobId?: string): Promise<number> {
  const all = await getAll<PhotoJob>(PHOTOS);
  return jobId ? all.filter((p) => p.jobId === jobId).length : all.length;
}

// ---- Mutations -------------------------------------------------------------

export async function queueMutation(url: string, method: string, body: unknown): Promise<boolean> {
  const key = await tx<IDBValidKey>(MUTATIONS, "readwrite", (s) =>
    s.add({ url, method, body: JSON.stringify(body), queuedAt: Date.now() } as Mutation)
  );
  return key != null;
}

export async function pendingMutationCount(): Promise<number> {
  return (await getAll<Mutation>(MUTATIONS)).length;
}

/** Wipes both queues — called on logout so nothing persists on a shared device. */
export async function clearQueue(): Promise<void> {
  await tx(PHOTOS, "readwrite", (s) => s.clear());
  await tx(MUTATIONS, "readwrite", (s) => s.clear());
}

// ---- Flush -----------------------------------------------------------------

let flushing = false;

/**
 * Replays every queued photo and mutation. Runs single-flight; safe to call on
 * 'online', on app load, and after a manual save. Returns how many synced.
 */
export async function flushQueue(): Promise<{ photos: number; mutations: number }> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { photos: 0, mutations: 0 };
  }
  flushing = true;
  let photos = 0;
  let mutations = 0;
  try {
    // Mutations first (cheap), oldest-first.
    for (const m of (await getAll<Mutation>(MUTATIONS)).sort((a, b) => a.queuedAt - b.queuedAt)) {
      try {
        const res = await fetch(m.url, {
          method: m.method,
          headers: { "content-type": "application/json" },
          body: m.body,
        });
        if (res.ok) {
          await tx(MUTATIONS, "readwrite", (s) => s.delete(m.id!));
          mutations++;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
          // Client error (bad/stale request) — it will never succeed on retry,
          // so drop it rather than loop forever. 401/429 are transient (auth/
          // rate-limit) and kept for a later retry.
          await tx(MUTATIONS, "readwrite", (s) => s.delete(m.id!));
        } else {
          break; // 5xx / 401 / 429 — server-side or transient, retry later
        }
      } catch {
        break; // still offline — stop and retry later
      }
    }
    // Then photos, oldest-first, one per request (matches the live uploader).
    // A photo that can't be sent right now is left queued but does NOT block
    // newer photos — otherwise one un-acceptable head item freezes the queue.
    let networkDown = false;
    for (const p of (await getAll<PhotoJob>(PHOTOS)).sort((a, b) => a.queuedAt - b.queuedAt)) {
      if (networkDown) break;
      try {
        const form = new FormData();
        form.append("files", new File([p.blob], p.name, { type: p.type }));
        const res = await fetch(`/api/jobs/${p.jobId}/photos`, { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok !== false) {
          await tx(PHOTOS, "readwrite", (s) => s.delete(p.id!));
          photos++;
        }
        // else: leave it queued and move on to the next photo.
      } catch {
        networkDown = true; // connection dropped — stop this pass, retry later
      }
    }
  } finally {
    flushing = false;
  }
  return { photos, mutations };
}

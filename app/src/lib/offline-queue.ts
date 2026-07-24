"use client";

import { INTERNAL } from "@/lib/brand";

// Offline-first work queue. Two things can be queued when the device has no
// signal and replayed automatically when it returns:
//   • photos — binary, stored in IndexedDB (localStorage can't hold blobs)
//   • mutations — JSON API writes (checklist ticks, notes), stored in IndexedDB
//
// Everything degrades gracefully: if IndexedDB is unavailable the callers just
// fall back to a live request.

const DB_NAME = INTERNAL.offlineDbName;
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

export type MutationFlushDecision = "delete-ok" | "keep-auth" | "drop" | "retry";

/**
 * Whether a replayed write hit the auth gate rather than its handler: a
 * middleware 307→/login surfaces (with redirect:"manual") as an opaque response
 * (type "opaqueredirect", status 0); 401/403/405 mean the same. On any of these
 * the queued item must be KEPT, not dropped.
 */
export function isAuthLapse(res: { status: number; type?: string }): boolean {
  return (
    res.type === "opaqueredirect" ||
    res.status === 0 ||
    res.status === 401 ||
    res.status === 403 ||
    res.status === 405
  );
}

/**
 * How to treat a replayed mutation's response:
 *  - delete-ok : it succeeded — remove it from the queue.
 *  - keep-auth : the session has lapsed (a middleware redirect to /login, seen
 *                as an opaque response, or a 401/403/405) — KEEP the write and
 *                stop the pass so on-site work is never silently lost; the UI
 *                prompts a re-auth.
 *  - drop      : a genuine client-validation error (400/409/422…) that will
 *                never succeed on retry.
 *  - retry     : transient (5xx / 429) — keep and try again later.
 */
export function classifyMutationResponse(res: { ok: boolean; status: number; type?: string }): MutationFlushDecision {
  if (res.ok) return "delete-ok";
  if (isAuthLapse(res)) return "keep-auth";
  if (res.status === 429) return "retry"; // rate-limited — transient
  if (res.status >= 400 && res.status < 500) return "drop"; // genuine client error
  return "retry"; // 5xx and anything else — transient
}

/**
 * Replays every queued photo and mutation. Runs single-flight; safe to call on
 * 'online', on app load, and after a manual save. Returns how many synced, and
 * whether replay stopped because the session has lapsed (needsAuth).
 */
export async function flushQueue(): Promise<{ photos: number; mutations: number; needsAuth: boolean }> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { photos: 0, mutations: 0, needsAuth: false };
  }
  flushing = true;
  let photos = 0;
  let mutations = 0;
  let needsAuth = false;
  try {
    // Mutations first (cheap), oldest-first.
    for (const m of (await getAll<Mutation>(MUTATIONS)).sort((a, b) => a.queuedAt - b.queuedAt)) {
      let res: Response;
      try {
        res = await fetch(m.url, {
          method: m.method,
          headers: { "content-type": "application/json" },
          body: m.body,
          // A lapsed session makes the middleware 307-redirect to /login. Do NOT
          // follow it — a followed redirect returns 405 and used to be treated
          // as a permanent client error, silently deleting the queued write.
          redirect: "manual",
        });
      } catch {
        break; // still offline — stop and retry later
      }
      const decision = classifyMutationResponse(res);
      if (decision === "delete-ok") {
        await tx(MUTATIONS, "readwrite", (s) => s.delete(m.id!));
        mutations++;
      } else if (decision === "keep-auth") {
        needsAuth = true; // keep the write, stop, and prompt a re-auth
        break;
      } else if (decision === "drop") {
        await tx(MUTATIONS, "readwrite", (s) => s.delete(m.id!));
      } else {
        break; // retry — 5xx / 429
      }
    }
    // Then photos, oldest-first, one per request (matches the live uploader).
    // A photo that can't be sent right now is left queued but does NOT block
    // newer photos — otherwise one un-acceptable head item freezes the queue.
    for (const p of (await getAll<PhotoJob>(PHOTOS)).sort((a, b) => a.queuedAt - b.queuedAt)) {
      let res: Response;
      try {
        const form = new FormData();
        form.append("files", new File([p.blob], p.name, { type: p.type }));
        res = await fetch(`/api/jobs/${p.jobId}/photos`, { method: "POST", body: form, redirect: "manual" });
      } catch {
        break; // connection dropped — stop this pass, retry later
      }
      // Session lapsed — keep the photo, flag re-auth, and stop the pass.
      if (isAuthLapse(res)) {
        needsAuth = true;
        break;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        await tx(PHOTOS, "readwrite", (s) => s.delete(p.id!));
        photos++;
      }
      // else: a non-auth 4xx/5xx — leave it queued and move on to the next photo
      // so one un-acceptable item doesn't freeze the queue (P2-F2 adds a way to
      // clear a permanently-rejected photo).
    }
  } finally {
    flushing = false;
  }
  return { photos, mutations, needsAuth };
}

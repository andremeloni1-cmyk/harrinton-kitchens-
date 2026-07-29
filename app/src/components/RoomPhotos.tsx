"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/job";
import { photoRef } from "@/lib/measure-ref";

export type MeasurePhoto = { id: string; name: string; mimeType: string; createdAt: string };

/**
 * Downscale before upload.
 *
 * A modern phone photo is 4–8 MB, and a check measure runs to a dozen per room
 * on a bad site. Full resolution buys nothing here — these are read on a phone
 * to answer "which side was the pipe on" — and uploading it over site 4G is
 * how you lose a measure. 1600px on the long edge stays legible zoomed in.
 */
async function downscale(file: File, maxEdge = 1600, quality = 0.82): Promise<{ data: string; mimeType: string }> {
  const raw = await file.arrayBuffer();
  const toBase64 = (buf: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };
  const original = { data: toBase64(raw), mimeType: file.type || "image/jpeg" };

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    const data = url.split(",")[1];
    if (!data) return original;
    return { data, mimeType: "image/jpeg" };
  } catch {
    // No createImageBitmap (older Safari, some webviews) — send it as it came
    // rather than refusing the photo.
    return original;
  }
}

export function measurePhotoUrl(jobId: string, docId: string): string {
  return `/api/jobs/${jobId}/documents?docId=${encodeURIComponent(docId)}`;
}

/**
 * The photos attached to one room of a check measure.
 *
 * Each carries its own reference (CM-1042-R1-IMG2), which is the whole point:
 * a photo you can name is a photo you can point at in an email six months
 * later. The refs are positional, so they renumber if photos are removed —
 * fine while the measure is a draft, which is when photos get taken.
 */
export function RoomPhotos({
  jobId,
  cmRef,
  roomIndex,
  photoIds,
  photos,
  onChange,
  onUploaded,
}: {
  jobId: string;
  cmRef: string | null;
  roomIndex: number;
  photoIds: string[];
  /** Every photo on the job's measure, so a thumbnail can find its name. */
  photos: Record<string, MeasurePhoto>;
  onChange: (photoIds: string[]) => void;
  onUploaded: (photo: MeasurePhoto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; ref: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        const { data, mimeType } = await downscale(file);
        const res = await api<{ photo: MeasurePhoto }>(`/api/jobs/${jobId}/measure/photos`, {
          method: "POST",
          body: JSON.stringify({ name: file.name || "Site photo", fileData: data, mimeType }),
        });
        onUploaded(res.photo);
        added.push(res.photo.id);
      }
      if (added.length) onChange([...photoIds, ...added]);
    } catch (e) {
      // Whatever made it up is already attached; only the rest is lost.
      if (added.length) onChange([...photoIds, ...added]);
      setMsg(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/jobs/${jobId}/measure/photos?docId=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // Already gone server-side is the same outcome as removing it — drop the
      // reference either way so the room doesn't keep a broken thumbnail.
    } finally {
      onChange(photoIds.filter((p) => p !== id));
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-stone-700 dark:text-slate-200">Photos</span>
        <button className="btn-ghost text-sm text-brand-600" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "+ Add photos"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {photoIds.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-slate-500">
          Photograph anything a dimension can&apos;t carry — the meter box, the run of pipe, the state of the floor.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photoIds.map((id, i) => {
            const ref = cmRef ? photoRef(cmRef, roomIndex, i) : `Photo ${i + 1}`;
            return (
              <div key={id} className="relative shrink-0">
                <button onClick={() => setPreview({ id, ref })} className="block" aria-label={`View ${ref}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={measurePhotoUrl(jobId, id)}
                    alt={photos[id]?.name || ref}
                    className="h-24 w-24 rounded-xl object-cover ring-1 ring-stone-200 dark:ring-night-line"
                  />
                </button>
                <span className="mt-1 block text-center text-[10px] font-semibold tabular-nums text-stone-400 dark:text-slate-500">
                  {ref}
                </span>
                <button
                  onClick={() => remove(id)}
                  aria-label={`Remove ${ref}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900/80 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {msg && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {msg}
        </p>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-label={preview.ref}
        >
          <div className="max-h-full w-full max-w-2xl overflow-auto rounded-2xl bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={measurePhotoUrl(jobId, preview.id)} alt={preview.ref} className="w-full rounded-xl" />
            <p className="px-2 py-1.5 text-center text-xs font-semibold text-stone-500">{preview.ref}</p>
          </div>
        </div>
      )}
    </div>
  );
}

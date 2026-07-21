"use client";

import { useRef, useState } from "react";
import type { JobDTO } from "@/lib/job";
import { queuePhoto } from "@/lib/offline-queue";

/**
 * Site photos: upload images straight from the dashboard into the job's shared
 * "Photos (client)" Drive folder, and surface a link you can send to the client.
 */
export function PhotoUpload({ job, onChanged }: { job: JobDTO; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const photos = (job.documents || []).filter((d) => d.source === "upload");
  const clientLink = job.drivePhotosFolderId
    ? `https://drive.google.com/drive/folders/${job.drivePhotosFolderId}`
    : "";

  // Two photos per request — small enough to sail under any server/proxy size
  // limit even before shrinking, one shared-folder create, fine-grained progress.
  const CHUNK_SIZE = 2;

  async function upload(fileList: FileList | null) {
    const picked = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      if (fileList && fileList.length) setMsg("Those files aren’t images — pick photos to upload.");
      return;
    }

    // Shrink each photo in the browser first. A modern iPhone photo is 3–8 MB;
    // resized to 2048px JPEG it's ~400 KB, so uploads are fast and reliable on
    // patchy signal and never hit the server's request-size limit.
    setBusy(true);
    setMsg(null);
    setProgress({ done: 0, total: picked.length });
    const images: File[] = [];
    for (const f of picked) images.push(await downscaleImage(f));

    // No signal? Queue every photo locally and let the offline queue upload
    // them when the connection returns — nothing taken on-site is lost.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      let queued = 0;
      for (const f of images) if (await queuePhoto(job.id, f)) queued++;
      window.dispatchEvent(new CustomEvent("jf-offline-queued"));
      const failed = images.length - queued;
      setMsg(
        failed > 0
          ? `You're offline. ${queued} photo${queued === 1 ? "" : "s"} saved to upload later, but ${failed} couldn't be stored (device storage full) — free up space and try those again.`
          : `You're offline — ${queued} photo${queued === 1 ? "" : "s"} saved and will upload automatically when you're back online.`
      );
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setProgress({ done: 0, total: images.length });

    let saved = 0;
    let failed = 0;
    let queued = 0;
    let note: string | null = null; // a specific server message worth surfacing (e.g. "connect Google")
    let shareBlocked = false; // Google account refused anyone-with-link sharing
    try {
      for (let i = 0; i < images.length; i += CHUNK_SIZE) {
        const group = images.slice(i, i + CHUNK_SIZE);
        const form = new FormData();
        group.forEach((f) => form.append("files", f));
        try {
          const res = await fetch(`/api/jobs/${job.id}/photos`, { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok !== false) {
            saved += data.saved || 0;
            if (data.shared === false) shareBlocked = true;
          } else {
            failed += group.length;
            if (data.message) note = data.message;
          }
        } catch {
          // Lost signal mid-upload — queue the rest for automatic retry.
          for (const f of group) await queuePhoto(job.id, f);
          queued += group.length;
        }
        setProgress({ done: Math.min(i + CHUNK_SIZE, images.length), total: images.length });
      }

      if (queued > 0) window.dispatchEvent(new CustomEvent("jf-offline-queued"));
      if (saved > 0) onChanged();
      const warn = shareBlocked
        ? " Your Google account blocked the public link, so clients can’t open it yet — see the note below."
        : "";
      setMsg(
        note && saved === 0
          ? note
          : queued > 0
          ? `Uploaded ${saved} photo${saved === 1 ? "" : "s"}; ${queued} queued — they'll upload when you're back online.`
          : failed > 0
          ? `Uploaded ${saved} photo${saved === 1 ? "" : "s"}; ${failed} didn’t go through — try those again.${warn}`
          : `Uploaded ${saved} photo${saved === 1 ? "" : "s"} — saved to the client folder.${warn}`
      );
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyLink() {
    if (!clientLink) return;
    try {
      await navigator.clipboard.writeText(clientLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still shown below */
    }
  }

  async function toggleShare(docId: string, next: boolean) {
    await fetch(`/api/jobs/${job.id}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ docId, sharedWithClient: next }),
    }).catch(() => {});
    onChanged();
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-100 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30 dark:hover:bg-brand-500/25"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <circle cx="12" cy="13" r="3.5" />
          <path d="M8 6l1.5-2h5L16 6" strokeLinejoin="round" />
        </svg>
        {busy ? (progress ? `Uploading ${progress.done}/${progress.total}…` : "Uploading…") : "Upload / take photos"}
      </button>

      {photos.length > 0 ? (
        <ul className="space-y-2">
          {photos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
                <span>🖼️</span>
                <span className="truncate">{p.name}</span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleShare(p.id, !p.sharedWithClient)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${p.sharedWithClient ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-stone-100 text-stone-500 dark:bg-night-800 dark:text-slate-400"}`}
                >
                  {p.sharedWithClient ? "✓ Shown to client" : "Show client"}
                </button>
                {p.webViewLink && (
                  <a href={p.webViewLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600">Open</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-400 dark:text-slate-500">
          No photos yet. Upload site photos and a shareable link is created for the client automatically.
        </p>
      )}

      {clientLink && (
        <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 dark:bg-night-850 dark:ring-night-line">
          <p className="label mb-1">Client photo link (anyone with the link can view)</p>
          <div className="flex items-center gap-2">
            <a
              href={clientLink}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-brand-600"
            >
              {clientLink}
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-300 dark:bg-night-800 dark:text-slate-200 dark:hover:bg-night-850"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-night-800 dark:text-slate-300">{msg}</p>}
    </div>
  );
}

// Resize a photo to a sensible max dimension and re-encode as JPEG, so uploads
// stay small and reliable. Falls back to the original file if the browser can't
// decode it (very old browsers / unusual formats).
const MAX_DIMENSION = 2048;
async function downscaleImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file; // no gain (e.g. already small) — keep original
    const name = file.name.replace(/\.(heic|heif|png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

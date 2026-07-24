"use client";

import { useRef, useState } from "react";
import { api, type DocumentDTO } from "@/lib/job";
import { relativeTime } from "@/lib/format";

/** Admin side of plan review: upload a plan PDF/image to the client's portal
 * and track their approve / request-changes response. */
export function PlanReview({
  jobId,
  plans,
  onChanged,
}: {
  jobId: string;
  plans: DocumentDTO[];
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Couldn't read the file"));
        r.readAsDataURL(file);
      });
      await api(`/api/jobs/${jobId}/documents`, {
        method: "POST",
        body: JSON.stringify({ name: file.name, mimeType: file.type || "application/pdf", fileData: b64 }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(doc: DocumentDTO) {
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/documents?docId=${doc.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the plan");
    }
  }

  return (
    <div>
      {plans.length === 0 ? (
        <p className="mb-2 text-sm text-stone-400 dark:text-slate-500">
          Share the kitchen plans here — the client reviews and approves them on their portal.
        </p>
      ) : (
        <ul className="mb-3 space-y-2.5">
          {plans.map((d) => (
            <li key={d.id} className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-night-850">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-slate-100">📐 {d.name}</span>
                <a
                  href={`/api/jobs/${jobId}/documents?docId=${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-sm font-semibold text-brand-600"
                >
                  View
                </a>
                <button
                  onClick={() => remove(d)}
                  className="shrink-0 rounded-full p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-500 dark:text-slate-600 dark:hover:bg-night-800"
                  aria-label="Remove plan"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="mt-1.5">
                {d.reviewStatus === "approved" ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-500/10 dark:text-green-300">
                    ✅ Approved by client {d.reviewedAt ? relativeTime(d.reviewedAt) : ""}
                  </span>
                ) : d.reviewStatus === "changes_requested" ? (
                  <div>
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      ✏️ Changes requested {d.reviewedAt ? relativeTime(d.reviewedAt) : ""}
                    </span>
                    {d.reviewNote && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        &ldquo;{d.reviewNote}&rdquo;
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
                    ⏳ Awaiting client review
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-sm font-medium text-brand-600 disabled:opacity-50">
        {busy ? "Uploading…" : "+ Upload plan for client review"}
      </button>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
    </div>
  );
}

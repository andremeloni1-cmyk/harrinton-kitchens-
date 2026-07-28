"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/job";

type DocRef = { id: string; name: string; mimeType: string; createdAt: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// A mudmap is an uploaded photo and goes through the shared document endpoint.
// A plan is SVG this app generated, which that endpoint deliberately forces to
// download rather than render — it has its own hardened route instead.
function mudmapUrl(jobId: string, docId: string): string {
  return `/api/jobs/${jobId}/documents?docId=${encodeURIComponent(docId)}`;
}
function planUrl(jobId: string, docId: string): string {
  return `/api/jobs/${jobId}/plan/${encodeURIComponent(docId)}`;
}
function docUrl(jobId: string, doc: DocRef): string {
  return doc.mimeType === "image/svg+xml" ? planUrl(jobId, doc.id) : mudmapUrl(jobId, doc.id);
}

/**
 * The mudmap and the plan drawn from it.
 *
 * The mudmap is the biro sketch off the site sheet; the plan is what this app
 * draws from the measurements once they're in. Both stay internal — the client
 * sees the finished drawing set, not the working-out.
 */
export function MudmapAndPlan({ jobId, onPlanDrawn }: { jobId: string; onPlanDrawn?: () => void }) {
  const [mudmaps, setMudmaps] = useState<DocRef[]>([]);
  const [plans, setPlans] = useState<DocRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocRef | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([
      api<{ mudmaps: DocRef[] }>(`/api/jobs/${jobId}/mudmap`).catch(() => ({ mudmaps: [] })),
      api<{ plans: DocRef[] }>(`/api/jobs/${jobId}/plan`).catch(() => ({ plans: [] })),
    ]);
    setMudmaps(m.mudmaps);
    setPlans(p.plans);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const fileData = await fileToBase64(file);
        await api(`/api/jobs/${jobId}/mudmap`, {
          method: "POST",
          body: JSON.stringify({ name: file.name || "Mudmap", fileData, mimeType: file.type }),
        });
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't upload that.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeMudmap(id: string) {
    setBusy(true);
    try {
      await api(`/api/jobs/${jobId}/mudmap?docId=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function drawPlan() {
    setDrawing(true);
    setMsg(null);
    try {
      const res = await api<{ plans: DocRef[]; skipped: number }>(`/api/jobs/${jobId}/plan`, { method: "POST" });
      setPlans(res.plans);
      if (res.skipped > 0) {
        setMsg(`Drew ${res.plans.length}. ${res.skipped} room${res.skipped === 1 ? "" : "s"} had no wall measurements.`);
      }
      onPlanDrawn?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't draw the plan.");
    } finally {
      setDrawing(false);
    }
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Mudmap & plan</p>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Photograph the sketch, then draw it up from the measurements above.
          </p>
        </div>
        <button className="btn-secondary shrink-0 text-sm" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {mudmaps.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {mudmaps.map((m) => (
            <div key={m.id} className="relative shrink-0">
              <button onClick={() => setPreview(m)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mudmapUrl(jobId, m.id)}
                  alt={m.name}
                  className="h-24 w-24 rounded-xl object-cover ring-1 ring-stone-200 dark:ring-night-line"
                />
              </button>
              <button
                onClick={() => removeMudmap(m.id)}
                aria-label={`Remove ${m.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900/80 text-xs text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 dark:border-night-line">
        <button className="btn-primary flex-1 text-sm" disabled={drawing} onClick={drawPlan}>
          {drawing ? "Drawing…" : plans.length > 0 ? "Redraw plan" : "Draw plan from measurements"}
        </button>
      </div>

      {plans.length > 0 && (
        <div className="mt-3 space-y-2">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreview(p)}
              className="flex w-full items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-left dark:bg-night-850"
            >
              <span className="text-lg">📐</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                {p.name}
              </span>
              <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">View</span>
            </button>
          ))}
          <p className="text-[11px] text-stone-400 dark:text-slate-500">
            Drawn to scale from the measurements. Redrawing replaces these.
          </p>
        </div>
      )}

      {msg && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {msg}
        </p>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-label={preview.name}
        >
          <div className="max-h-full w-full max-w-2xl overflow-auto rounded-2xl bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={docUrl(jobId, preview)} alt={preview.name} className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

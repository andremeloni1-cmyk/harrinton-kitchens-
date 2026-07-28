"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type JobDTO } from "@/lib/job";
import { Modal } from "@/components/Modal";
import {
  LOAD_STATUS_LABELS,
  canTransition,
  itemLabel,
  loadProgress,
  reconcile,
  deliveryProgress,
  type LoadStatus,
} from "@/lib/loads";

type Item = {
  id: string;
  stopId: string | null;
  kind: "cabinet" | "part" | "extra";
  description: string;
  qty: number;
  expected: boolean;
  loadedAt: string | null;
  deliveredAt?: string | null;
  method: string | null;
  proofs: { id: string; createdAt: string }[];
};

type Stop = {
  id: string;
  address: string;
  sequence: number;
  job: { id: string; reference: string; title: string; clientName: string | null; address: string | null };
};

type LoadDetail = {
  id: string;
  reference: string;
  status: LoadStatus;
  driverName: string | null;
  vehicle: string;
  note: string;
  departedAt: string | null;
  deliveredAt: string | null;
  stops: Stop[];
  items: Item[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Best-effort position — a driver may well decline, and that's fine. */
function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

export function LoadSheet({ loadId, canManage }: { loadId: string; canManage: boolean }) {
  const [load, setLoad] = useState<LoadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [addingJob, setAddingJob] = useState(false);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [extra, setExtra] = useState("");
  const [proofFor, setProofFor] = useState<Item | "stop" | null>(null);
  const proofInput = useRef<HTMLInputElement>(null);
  const pendingProof = useRef<Item | "stop" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ load: LoadDetail }>(`/api/loads/${loadId}`);
      setLoad(r.load);
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openJobPicker() {
    setAddingJob(true);
    try {
      const r = await api<{ jobs: JobDTO[] }>("/api/jobs");
      setJobs(r.jobs.filter((j) => !["completed", "cancelled"].includes(j.status)));
    } catch {
      setJobs([]);
    }
  }

  async function addStop(jobId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ added: number }>(`/api/loads/${loadId}/stops`, {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      setMsg(
        r.added === 0
          ? "Added — that job has no cut list yet, so add its lines by hand."
          : `Added ${r.added} line${r.added === 1 ? "" : "s"} to the list.`
      );
      setAddingJob(false);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't add that job.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLoaded(item: Item) {
    setBusy(true);
    try {
      await api(`/api/loads/${loadId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ itemId: item.id, loaded: item.loadedAt == null, method: "tap" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addExtra(stopId: string | null, expected: boolean) {
    if (!extra.trim()) return;
    setBusy(true);
    try {
      await api(`/api/loads/${loadId}/items`, {
        method: "POST",
        body: JSON.stringify({ description: extra.trim(), stopId, expected }),
      });
      setExtra("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: LoadStatus) {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/loads/${loadId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't update the load.");
    } finally {
      setBusy(false);
    }
  }

  function askForProof(target: Item | "stop") {
    pendingProof.current = target;
    proofInput.current?.click();
  }

  async function uploadProof(files: FileList | null) {
    const target = pendingProof.current;
    pendingProof.current = null;
    if (!files || files.length === 0 || !target) return;
    setBusy(true);
    setMsg(null);
    try {
      const photoData = await fileToBase64(files[0]);
      const position = await currentPosition();
      await api(`/api/loads/${loadId}/proof`, {
        method: "POST",
        body: JSON.stringify({
          photoData,
          photoMime: files[0].type,
          itemId: target === "stop" ? undefined : target.id,
          stopId: target === "stop" ? load?.stops[0]?.id : target.stopId,
          ...(position || {}),
        }),
      });
      setMsg("Proof recorded.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't record that proof.");
    } finally {
      setBusy(false);
      setProofFor(null);
      if (proofInput.current) proofInput.current.value = "";
    }
  }

  if (loading) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;
  if (!load) return <div className="px-4 pt-6 text-stone-500 dark:text-slate-400">That load no longer exists.</div>;

  // A line counts as delivered once it has a proof against it. That lives in
  // `proofs` on the wire rather than a column, so it is derived here before the
  // pure helpers see it.
  const items: Item[] = load.items.map((i) => ({
    ...i,
    deliveredAt: i.proofs[0]?.createdAt ?? null,
  }));
  const progress = loadProgress(items);
  const delivery = deliveryProgress(items);
  const { missing, unexpected } = reconcile(items);
  // Anything not attached to a stop — an unexpected line found on the truck can
  // arrive without one, and it must not be invisible.
  const looseItems = items.filter((i) => i.stopId == null);

  return (
    <div className="px-4 pt-5 pb-4">
      <Link href="/deliveries" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All loads
      </Link>

      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">{load.reference}</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            {LOAD_STATUS_LABELS[load.status]}
            {load.driverName ? ` · ${load.driverName}` : ""}
            {load.vehicle ? ` · ${load.vehicle}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canTransition(load.status, "departed") && (
            <button className="btn-primary text-sm" disabled={busy} onClick={() => setStatus("departed")}>
              Depart
            </button>
          )}
          {canTransition(load.status, "delivered") && (
            <button className="btn-primary text-sm" disabled={busy} onClick={() => setStatus("delivered")}>
              Delivered
            </button>
          )}
        </div>
      </header>

      {msg && (
        <p className="mb-3 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-night-800 dark:text-slate-200">
          {msg}
        </p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label="Loaded" value={`${progress.done}/${progress.total}`} />
        <Stat label="Delivered" value={`${delivery.done}/${delivery.total}`} />
      </div>

      {/* Reconciliation — both directions, always visible once anything is off */}
      {(missing.length > 0 || unexpected.length > 0) && (
        <div className="card mb-3 border-l-4 border-amber-400 p-4">
          <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Reconciliation</p>
          {missing.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                On the list, not on the truck ({missing.length})
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-600 dark:text-slate-300">
                {missing.map((i) => (
                  <li key={i.id}>· {itemLabel(i)}</li>
                ))}
              </ul>
            </div>
          )}
          {unexpected.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                On the truck, not on the list ({unexpected.length})
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-600 dark:text-slate-300">
                {unexpected.map((i) => (
                  <li key={i.id}>· {itemLabel(i)}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
                A panel loaded against the wrong job arrives at the wrong address.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stops, each with its own list */}
      {load.stops.map((stop) => {
        const stopItems = items.filter((i) => i.stopId === stop.id);
        return (
          <div key={stop.id} className="card mb-3">
            <div className="border-b border-stone-100 px-4 py-3 dark:border-night-line">
              <p className="text-sm font-bold text-stone-900 dark:text-slate-100">{stop.job.title}</p>
              <p className="text-xs text-stone-500 dark:text-slate-400">
                {stop.job.reference}
                {stop.job.clientName ? ` · ${stop.job.clientName}` : ""}
              </p>
              {(stop.address || stop.job.address) && (
                <p className="text-xs text-stone-400 dark:text-slate-500">📍 {stop.address || stop.job.address}</p>
              )}
            </div>

            <div className="divide-y divide-stone-100 dark:divide-night-line">
              {stopItems.length === 0 ? (
                <p className="px-4 py-3 text-sm text-stone-400 dark:text-slate-500">
                  Nothing on the list for this stop yet.
                </p>
              ) : (
                stopItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => toggleLoaded(item)}
                      disabled={busy}
                      aria-label={item.loadedAt ? `Unload ${item.description}` : `Load ${item.description}`}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm transition ${
                        item.loadedAt
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-stone-300 text-transparent dark:border-night-line"
                      }`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${
                          item.loadedAt
                            ? "text-stone-500 line-through dark:text-slate-500"
                            : "font-medium text-stone-900 dark:text-slate-100"
                        }`}
                      >
                        {itemLabel(item)}
                      </p>
                      <p className="text-[11px] text-stone-400 dark:text-slate-500">
                        {item.kind}
                        {!item.expected && " · not on the list"}
                        {item.proofs.length > 0 && " · delivered ✓"}
                      </p>
                    </div>
                    <button
                      className="shrink-0 text-xs font-semibold text-brand-600"
                      disabled={busy}
                      onClick={() => askForProof(item)}
                    >
                      {item.proofs.length > 0 ? "Photo" : "Proof"}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-stone-100 px-4 py-2.5 dark:border-night-line">
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Sink, tap, oven, benchtop…"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                />
                <button className="btn-secondary text-sm" disabled={busy} onClick={() => addExtra(stop.id, true)}>
                  Add
                </button>
              </div>
              <button
                className="btn-ghost mt-1.5 text-xs text-brand-600"
                disabled={busy}
                onClick={() => setProofFor("stop")}
              >
                📷 Site photo for this drop
              </button>
            </div>
          </div>
        );
      })}

      {/* Lines that belong to the truck rather than a stop — usually something
          found on board that nobody put on a list. */}
      {looseItems.length > 0 && (
        <div className="card mb-3">
          <p className="border-b border-stone-100 px-4 py-3 text-sm font-bold text-stone-900 dark:border-night-line dark:text-slate-100">
            Not assigned to a stop
          </p>
          <div className="divide-y divide-stone-100 dark:divide-night-line">
            {looseItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => toggleLoaded(item)}
                  disabled={busy}
                  aria-label={item.loadedAt ? `Unload ${item.description}` : `Load ${item.description}`}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm transition ${
                    item.loadedAt
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-stone-300 text-transparent dark:border-night-line"
                  }`}
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900 dark:text-slate-100">
                    {itemLabel(item)}
                  </p>
                  <p className="text-[11px] text-stone-400 dark:text-slate-500">
                    {item.kind}
                    {!item.expected && " · not on the list"}
                  </p>
                </div>
                <button
                  className="shrink-0 text-xs font-semibold text-brand-600"
                  disabled={busy}
                  onClick={() => askForProof(item)}
                >
                  {item.proofs.length > 0 ? "Photo" : "Proof"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && load.status === "open" && (
        <button className="btn-secondary w-full" disabled={busy} onClick={openJobPicker}>
          + Add a job to this load
        </button>
      )}

      <input
        ref={proofInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => uploadProof(e.target.files)}
      />

      <Modal open={addingJob} onClose={() => setAddingJob(false)} title="Add a job">
        <div className="space-y-1.5">
          {jobs.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-slate-400">No open jobs.</p>
          ) : (
            jobs.map((j) => (
              <button
                key={j.id}
                disabled={busy}
                onClick={() => addStop(j.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-stone-50 dark:active:bg-night-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{j.title}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                    {j.reference}
                    {j.address ? ` · ${j.address}` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </Modal>

      <Modal open={proofFor === "stop"} onClose={() => setProofFor(null)} title="Site photo">
        <p className="text-sm text-stone-600 dark:text-slate-300">
          A photo of the kitchen once it&apos;s off the truck — it belongs to the drop rather than to any one line.
        </p>
        <button className="btn-primary mt-3 w-full" disabled={busy} onClick={() => askForProof("stop")}>
          Take photo
        </button>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-lg font-bold text-stone-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-stone-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

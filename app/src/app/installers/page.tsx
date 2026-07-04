"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import { fmtDay, fmtRange } from "@/lib/format";
import { api } from "@/lib/job";
import { workdaySegments, startOfWeek, WORKDAY_MINS } from "@/lib/schedule";
import { workloadBarColor } from "@/components/WorkloadCard";

type InstallerJob = {
  id: string;
  title: string;
  status: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  durationMins: number;
  address?: string | null;
};

type Installer = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  color: string;
  active: boolean;
  notes?: string | null;
  jobs: InstallerJob[];
  _count: { jobs: number; reports: number };
};

type FormValues = { name: string; role: string; email: string; phone: string; notes: string };
const EMPTY_FORM: FormValues = { name: "", role: "Installer", email: "", phone: "", notes: "" };

/** Booked minutes this working week for an installer's active jobs → 0-100%. */
function weekLoad(jobs: InstallerJob[]): number {
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  let mins = 0;
  for (const j of jobs) {
    if (!j.scheduledStart) continue;
    for (const seg of workdaySegments(new Date(j.scheduledStart), j.durationMins || WORKDAY_MINS)) {
      if (seg.start >= weekEnd) break;
      if (seg.start >= weekStart) mins += (seg.end.getTime() - seg.start.getTime()) / 60_000;
    }
  }
  return Math.min(100, Math.round((mins / (5 * WORKDAY_MINS)) * 100));
}

export default function InstallersPage() {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Installer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { installers } = await api<{ installers: Installer[] }>("/api/installers");
      setInstallers(installers);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => installers.filter((i) => i.active), [installers]);
  const inactive = useMemo(() => installers.filter((i) => !i.active), [installers]);
  const unassignedHint = useMemo(
    () => active.length > 0 && active.every((i) => i.jobs.length === 0),
    [active]
  );

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }
  function openEdit(i: Installer) {
    setEditingId(i.id);
    setForm({ name: i.name, role: i.role, email: i.email || "", phone: i.phone || "", notes: i.notes || "" });
    setError(null);
    setSelected(null);
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Please enter a name.");
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api(`/api/installers/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("/api/installers", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(i: Installer, value: boolean) {
    await api(`/api/installers/${i.id}`, { method: "PATCH", body: JSON.stringify({ active: value }) });
    setSelected(null);
    await load();
  }

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Installers</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">Your install team — workload &amp; assignments</p>
        </div>
        <button onClick={openAdd} className="btn-primary shrink-0">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add
        </button>
      </header>

      {unassignedHint && (
        <p className="mb-3 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
          Assign installers to jobs from a job&apos;s <b>Edit</b> form — their run sheet then shows in the installer portal.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : installers.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">🛠️</span>}
          title="No installers yet"
          subtitle="Add your install team to start assigning jobs and tracking workload."
          action={<button className="btn-primary" onClick={openAdd}>Add an installer</button>}
        />
      ) : (
        <>
          <div className="stagger space-y-2.5">
            {active.map((i) => {
              const load = weekLoad(i.jobs);
              const next = i.jobs.find((j) => j.scheduledStart && new Date(j.scheduledStart) >= startOfWeek(new Date()));
              return (
                <button key={i.id} onClick={() => setSelected(i)} className="card tap block w-full p-3.5 text-left transition active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: i.color }}
                    >
                      {initials(i.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{i.name}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                        {i.role} · {i.jobs.length} active job{i.jobs.length === 1 ? "" : "s"}
                        {next?.scheduledStart && <span> · next {fmtDay(next.scheduledStart)}</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">{load}% wk</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-night-800">
                    <div className={`h-full rounded-full ${workloadBarColor(load)}`} style={{ width: `${load}%` }} />
                  </div>
                </button>
              );
            })}
          </div>

          {inactive.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Inactive</p>
              <div className="space-y-2.5">
                {inactive.map((i) => (
                  <button key={i.id} onClick={() => setSelected(i)} className="card tap flex w-full items-center gap-3 p-3.5 text-left opacity-60">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-stone-500 dark:bg-night-800 dark:text-slate-400">
                      {initials(i.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{i.name}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-slate-400">{i.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Installer detail */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || "Installer"}>
        {selected && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: selected.color }}>
                {selected.role}
              </span>
              {!selected.active && (
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-night-800 dark:text-slate-400">
                  Inactive
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                  📞 {selected.phone}
                </a>
              )}
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
                  ✉️ {selected.email}
                </a>
              )}
            </div>
            {selected.notes && <p className="text-sm text-stone-500 dark:text-slate-400">{selected.notes}</p>}

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Active jobs" value={String(selected.jobs.length)} />
              <Stat label="All jobs" value={String(selected._count.jobs)} />
              <Stat label="Reports filed" value={String(selected._count.reports)} />
            </div>

            {selected.jobs.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Run sheet</p>
                <div className="card divide-y divide-stone-100 dark:divide-night-line">
                  {selected.jobs.map((j) => (
                    <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-3.5 py-2.5 active:bg-stone-50 dark:active:bg-night-800">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{j.title}</p>
                        <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                          {j.scheduledStart
                            ? `${fmtDay(j.scheduledStart)} · ${fmtRange(j.scheduledStart, j.scheduledEnd)}`
                            : "Not scheduled"}
                          {j.address ? ` · ${j.address}` : ""}
                        </p>
                      </div>
                      <StatusPill status={j.status} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1" onClick={() => openEdit(selected)}>
                Edit
              </button>
              {selected.active ? (
                <button className="btn-ghost flex-1 text-stone-500 dark:text-slate-400" onClick={() => setActive(selected, false)}>
                  Mark inactive
                </button>
              ) : (
                <button className="btn-secondary flex-1" onClick={() => setActive(selected, true)}>
                  Reactivate
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Add / edit form */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? "Edit installer" : "Add installer"}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Dave Morrison" autoFocus />
          </div>
          <div>
            <label className="label">Role</label>
            <input className="input" value={form.role} onChange={set("role")} placeholder="e.g. Lead installer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set("email")} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={set("notes")} placeholder="Licences, strengths, availability…" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save" : "Add installer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2 dark:bg-night-850">
      <div className="truncate text-sm font-bold text-stone-900 dark:text-slate-100">{value}</div>
      <div className="text-[11px] text-stone-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

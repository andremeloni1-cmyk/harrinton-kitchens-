"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { describeRule, type HardwareRule } from "@/lib/hardware-rules";
import type { HardwareItemDTO } from "@/lib/hardware";

type ItemRef = { id: string; code: string; name: string; unit: string; piecesPerPack: number };
type RuleRow = HardwareRule & { hardwareItem: ItemRef };

type FormValues = {
  name: string;
  hardwareItemId: string;
  qtyPer: string;
  cabinetType: string;
  panelCode: string;
  minPanelLengthMm: string;
  maxPanelLengthMm: string;
  minCabinetWidthMm: string;
  maxCabinetWidthMm: string;
  minCabinetDepthMm: string;
  maxCabinetDepthMm: string;
  notes: string;
};

const EMPTY: FormValues = {
  name: "",
  hardwareItemId: "",
  qtyPer: "1",
  cabinetType: "",
  panelCode: "",
  minPanelLengthMm: "",
  maxPanelLengthMm: "",
  minCabinetWidthMm: "",
  maxCabinetWidthMm: "",
  minCabinetDepthMm: "",
  maxCabinetDepthMm: "",
  notes: "",
};

/**
 * The rules that turn cabinets into hardware.
 *
 * Deliberately editable rather than coded: the schedule changes whenever the
 * hinge brand, the runner range or the drawer system changes, and the people who
 * know it are the people who buy the hardware, not a developer.
 *
 * Order matters and is shown — within one stock line the first matching rule
 * wins, which is what lets "doors to 900 take two, to 1600 take three" be
 * written as two overlapping rules.
 */
export default function HardwareRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [items, setItems] = useState<ItemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, i] = await Promise.all([
        api<{ rules: RuleRow[] }>("/api/hardware/rules"),
        api<{ items: HardwareItemDTO[] }>("/api/hardware"),
      ]);
      setRules(r.rules);
      setItems(i.items.map((x) => ({ id: x.id, code: x.code, name: x.name, unit: x.unit, piecesPerPack: 1 })));
    } catch {
      setError("Couldn't load the rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const byItem = new Map<string, RuleRow[]>();
    for (const rule of rules) {
      const key = rule.hardwareItem?.name ?? "Unknown";
      byItem.set(key, [...(byItem.get(key) ?? []), rule]);
    }
    return [...byItem.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rules]);

  function openNew() {
    setForm({ ...EMPTY, hardwareItemId: items[0]?.id ?? "" });
    setEditingId(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(rule: RuleRow) {
    const s = (n: number | null) => (n == null ? "" : String(n));
    setForm({
      name: rule.name,
      hardwareItemId: rule.hardwareItemId,
      qtyPer: String(rule.qtyPer),
      cabinetType: rule.cabinetType,
      panelCode: rule.panelCode,
      minPanelLengthMm: s(rule.minPanelLengthMm),
      maxPanelLengthMm: s(rule.maxPanelLengthMm),
      minCabinetWidthMm: s(rule.minCabinetWidthMm),
      maxCabinetWidthMm: s(rule.maxCabinetWidthMm),
      minCabinetDepthMm: s(rule.minCabinetDepthMm),
      maxCabinetDepthMm: s(rule.maxCabinetDepthMm),
      notes: rule.notes,
    });
    setEditingId(rule.id);
    setError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.hardwareItemId) {
      setError("Pick the hardware this rule produces.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      qtyPer: Number(form.qtyPer) || 1,
      // Blank bands are sent as null so editing a rule can widen it again.
      minPanelLengthMm: form.minPanelLengthMm || null,
      maxPanelLengthMm: form.maxPanelLengthMm || null,
      minCabinetWidthMm: form.minCabinetWidthMm || null,
      maxCabinetWidthMm: form.maxCabinetWidthMm || null,
      minCabinetDepthMm: form.minCabinetDepthMm || null,
      maxCabinetDepthMm: form.maxCabinetDepthMm || null,
      position: rules.length,
    };
    try {
      if (editingId) await api(`/api/hardware/rules/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/api/hardware/rules", { method: "POST", body: JSON.stringify(body) });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that rule.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: RuleRow) {
    await api(`/api/hardware/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ active: !rule.active }) }).catch(
      () => {}
    );
    await load();
  }

  async function remove(rule: RuleRow) {
    await api(`/api/hardware/rules/${rule.id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="px-4 pt-6">
      <Link href="/hardware" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Hardware
      </Link>

      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Hardware rules</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            What a cabinet on a CAD report needs. Within one hardware line, the first matching rule wins.
          </p>
        </div>
        <button className="btn-primary shrink-0 text-sm" onClick={openNew} disabled={items.length === 0}>
          + Rule
        </button>
      </header>

      {items.length === 0 && !loading && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Add hardware lines in the{" "}
          <Link href="/hardware" className="underline">
            hardware tracker
          </Link>{" "}
          first — a rule has to point at something you stock.
        </p>
      )}

      {loading ? (
        <p className="card p-5 text-sm text-stone-500 dark:text-slate-400">Loading…</p>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          subtitle="A rule says what a cabinet needs — two hinges per door panel, four legs per floor cabinet. Without them an imported report produces nothing."
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([itemName, group]) => (
            <div key={itemName}>
              <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                {itemName}
              </p>
              <div className="space-y-2">
                {group.map((rule) => (
                  <div key={rule.id} className={`card p-3 ${rule.active ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{rule.name}</p>
                        <p className="truncate text-xs text-stone-500 dark:text-slate-400">{describeRule(rule)}</p>
                        {rule.notes && (
                          <p className="truncate text-[11px] text-stone-400 dark:text-slate-500">{rule.notes}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-stone-500 dark:bg-night-800 dark:text-slate-400">
                        #{rule.position}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2 border-t border-stone-100 pt-2 dark:border-night-line">
                      <button className="btn-ghost text-xs text-brand-600" onClick={() => openEdit(rule)}>
                        Edit
                      </button>
                      <button
                        className="btn-ghost text-xs text-stone-500 dark:text-slate-400"
                        onClick={() => toggle(rule)}
                      >
                        {rule.active ? "Turn off" : "Turn on"}
                      </button>
                      <button className="btn-ghost ml-auto text-xs text-red-600" onClick={() => remove(rule)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal open onClose={() => setShowForm(false)} title={editingId ? "Edit rule" : "New rule"}>
          <div className="space-y-3">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                placeholder="Hinges — doors to 900mm"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Produces">
              <select
                className="input"
                value={form.hardwareItemId}
                onChange={(e) => setForm({ ...form, hardwareItemId: e.target.value })}
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} — {i.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="How many, each time it matches">
              <input
                className="input text-right tabular-nums"
                type="number"
                min={1}
                step="1"
                value={form.qtyPer}
                onChange={(e) => setForm({ ...form, qtyPer: e.target.value })}
              />
            </Field>

            <Field label="Per which panel? (leave blank for once per cabinet)">
              <input
                className="input"
                value={form.panelCode}
                placeholder="Door*  ·  Drw*  ·  Shelf Adj"
                onChange={(e) => setForm({ ...form, panelCode: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">
                The part code from your board report. <code>*</code> matches anything — <code>Door*</code> catches
                DoorLeft and DoorRight.
              </p>
            </Field>

            <Field label="Only in these cabinets (optional)">
              <input
                className="input"
                value={form.cabinetType}
                placeholder="Floor * Door"
                onChange={(e) => setForm({ ...form, cabinetType: e.target.value })}
              />
            </Field>

            <Band
              label="Panel length (mm)"
              hint="How a door height decides the hinge count"
              min={form.minPanelLengthMm}
              max={form.maxPanelLengthMm}
              onMin={(v) => setForm({ ...form, minPanelLengthMm: v })}
              onMax={(v) => setForm({ ...form, maxPanelLengthMm: v })}
            />
            <Band
              label="Cabinet width (mm)"
              min={form.minCabinetWidthMm}
              max={form.maxCabinetWidthMm}
              onMin={(v) => setForm({ ...form, minCabinetWidthMm: v })}
              onMax={(v) => setForm({ ...form, maxCabinetWidthMm: v })}
            />
            <Band
              label="Cabinet depth (mm)"
              hint="How a cabinet depth decides the runner length"
              min={form.minCabinetDepthMm}
              max={form.maxCabinetDepthMm}
              onMin={(v) => setForm({ ...form, minCabinetDepthMm: v })}
              onMax={(v) => setForm({ ...form, maxCabinetDepthMm: v })}
            />

            <Field label="Notes">
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save rule"}
              </button>
              <button className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Band({
  label,
  hint,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  hint?: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="input flex-1 text-right tabular-nums"
          type="number"
          min={0}
          placeholder="from"
          aria-label={`${label} from`}
          value={min}
          onChange={(e) => onMin(e.target.value)}
        />
        <span className="text-stone-400">–</span>
        <input
          className="input flex-1 text-right tabular-nums"
          type="number"
          min={0}
          placeholder="to"
          aria-label={`${label} to`}
          value={max}
          onChange={(e) => onMax(e.target.value)}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">{hint}</p>}
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

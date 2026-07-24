"use client";

import { useEffect, useRef, useState } from "react";
import { JOB_STATUSES, STATUS_LABELS } from "@/lib/types";
import { toLocalInput } from "@/lib/format";
import { api, type JobDTO } from "@/lib/job";
import { SuggestInput } from "@/components/SuggestInput";
import { DictateButton } from "@/components/DictateButton";

type CompanyOption = { id: string; name: string; displayName?: string | null; enabled: boolean };
type InstallerOption = { id: string; name: string; role: string; active: boolean };
type Contact = { name: string | null; email: string | null; phone: string | null };

export type JobFormValues = {
  title: string;
  companyId: string;
  installerId: string;
  description: string;
  status: string;
  priority: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  quoteAmount: string;
  durationMins: string;
  scheduledStart: string;
  notes: string;
};

function initial(job?: Partial<JobDTO>): JobFormValues {
  return {
    title: job?.title || "",
    companyId: job?.companyId || "",
    installerId: job?.installerId || "",
    description: job?.description || "",
    status: job?.status || "lead",
    priority: job?.priority || "normal",
    clientName: job?.clientName || "",
    clientEmail: job?.clientEmail || "",
    clientPhone: job?.clientPhone || "",
    address: job?.address || "",
    quoteAmount: job?.quoteAmount != null ? String(job.quoteAmount) : "",
    durationMins: job?.durationMins ? String(job.durationMins) : "120",
    scheduledStart: toLocalInput(job?.scheduledStart),
    notes: job?.notes || "",
  };
}

export function JobForm({
  job,
  onSubmit,
  onCancel,
  submitLabel = "Save job",
}: {
  job?: Partial<JobDTO>;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<JobFormValues>(initial(job));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The client companies to choose from (leave blank for private work).
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  useEffect(() => {
    api<{ sources: CompanyOption[] }>("/api/lead-sources")
      .then((r) => setCompanies((r.sources || []).filter((s) => s.enabled)))
      .catch(() => {});
  }, []);

  // The install team, for the assignment picker.
  const [installers, setInstallers] = useState<InstallerOption[]>([]);
  useEffect(() => {
    api<{ installers: InstallerOption[] }>("/api/installers")
      .then((r) => setInstallers((r.installers || []).filter((i) => i.active)))
      .catch(() => {});
  }, []);

  const set = (k: keyof JobFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  // Known people (site contacts + private clients) for the email autosuggest.
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => {
    api<{ contacts: Contact[] }>("/api/contacts")
      .then((r) => setContacts(r.contacts || []))
      .catch(() => {});
  }, []);
  const emailQuery = v.clientEmail.trim().toLowerCase();
  const emailSuggestions =
    emailQuery.length >= 2
      ? contacts
          .filter(
            (c) =>
              !!c.email &&
              (c.email.toLowerCase().includes(emailQuery) || (c.name || "").toLowerCase().includes(emailQuery))
          )
          .slice(0, 6)
          .map((c) => ({ key: c.email!, label: c.email!, sub: c.name || undefined }))
      : [];

  // Phone autosuggest — match on the digits typed, or the contact's name.
  const phoneQuery = v.clientPhone.trim();
  const phoneDigits = phoneQuery.replace(/\D/g, "");
  const phoneSuggestions =
    phoneQuery.length >= 3
      ? contacts
          .filter(
            (c) =>
              !!c.phone &&
              ((phoneDigits && c.phone.replace(/\D/g, "").includes(phoneDigits)) ||
                (c.name || "").toLowerCase().includes(phoneQuery.toLowerCase()))
          )
          .slice(0, 6)
          .map((c) => ({ key: c.phone!, label: c.phone!, sub: c.name || undefined }))
      : [];

  // Address autosuggest — debounced Google Places lookup (plain input when
  // GOOGLE_MAPS_API_KEY isn't configured on the server).
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const addressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onAddressChange(value: string) {
    setV((p) => ({ ...p, address: value }));
    if (addressTimer.current) clearTimeout(addressTimer.current);
    if (value.trim().length < 4) {
      setAddressSuggestions([]);
      return;
    }
    addressTimer.current = setTimeout(() => {
      api<{ suggestions: string[] }>(`/api/address/suggest?q=${encodeURIComponent(value.trim())}`)
        .then((r) => setAddressSuggestions(r.suggestions || []))
        .catch(() => setAddressSuggestions([]));
    }, 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) return setError("Please enter a job title.");
    setSaving(true);
    setError(null);
    try {
      const start = v.scheduledStart ? new Date(v.scheduledStart) : null;
      const dur = parseInt(v.durationMins, 10) || 120;
      const end = start ? new Date(start.getTime() + dur * 60_000) : null;
      await onSubmit({
        title: v.title.trim(),
        companyId: v.companyId || null,
        installerId: v.installerId || null,
        description: v.description || null,
        status: v.status,
        priority: v.priority,
        clientName: v.clientName || null,
        clientEmail: v.clientEmail || null,
        clientPhone: v.clientPhone || null,
        address: v.address || null,
        quoteAmount: v.quoteAmount ? Number(v.quoteAmount) : null,
        durationMins: dur,
        scheduledStart: start ? start.toISOString() : null,
        scheduledEnd: end ? end.toISOString() : null,
        notes: v.notes || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="job-title">Job title</label>
        <input id="job-title" className="input" value={v.title} onChange={set("title")} placeholder="e.g. QU3190 Nuzzo, or Oak staircase installation" autoFocus />
      </div>

      <div>
        <label className="label" htmlFor="job-company">Client (company)</label>
        <select id="job-company" className="input" value={v.companyId} onChange={set("companyId")}>
          <option value="">Direct / private client</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName || c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="job-installer">Installer</label>
        <select id="job-installer" className="input" value={v.installerId} onChange={set("installerId")}>
          <option value="">Unassigned</option>
          {installers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} — {i.role}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="job-status">Status</label>
          <select id="job-status" className="input" value={v.status} onChange={set("status")}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="job-priority">Priority</label>
          <select id="job-priority" className="input" value={v.priority} onChange={set("priority")}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="job-description">Description</label>
          <DictateButton onText={(t) => setV((p) => ({ ...p, description: p.description ? `${p.description} ${t}` : t }))} />
        </div>
        <textarea id="job-description" className="input" rows={2} value={v.description} onChange={set("description")} placeholder="What's the work?" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="job-client-name">Site contact name</label>
          <input id="job-client-name" className="input" value={v.clientName} onChange={set("clientName")} placeholder="homeowner / site contact" />
        </div>
        <div>
          <label className="label" htmlFor="job-client-phone">Site contact phone</label>
          <SuggestInput
            id="job-client-phone"
            type="tel"
            inputMode="tel"
            value={v.clientPhone}
            onChange={(value) => setV((p) => ({ ...p, clientPhone: value }))}
            suggestions={phoneSuggestions}
            onPick={(s) => {
              const c = contacts.find((c) => c.phone === s.key);
              setV((p) => ({
                ...p,
                clientPhone: s.key,
                clientName: p.clientName || c?.name || p.clientName,
                clientEmail: p.clientEmail || c?.email || p.clientEmail,
              }));
            }}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="job-client-email">Contact email</label>
        <SuggestInput
          id="job-client-email"
          type="email"
          value={v.clientEmail}
          placeholder="for automated updates"
          onChange={(value) => setV((p) => ({ ...p, clientEmail: value }))}
          suggestions={emailSuggestions}
          onPick={(s) => {
            const c = contacts.find((c) => c.email === s.key);
            setV((p) => ({
              ...p,
              clientEmail: s.key,
              // Fill name/phone from the known contact, without clobbering typed values.
              clientName: p.clientName || c?.name || p.clientName,
              clientPhone: p.clientPhone || c?.phone || p.clientPhone,
            }));
          }}
        />
      </div>

      <div>
        <label className="label" htmlFor="job-address">Site address</label>
        <SuggestInput
          id="job-address"
          value={v.address}
          onChange={onAddressChange}
          suggestions={addressSuggestions.map((a) => ({ key: a, label: a }))}
          onPick={(s) => {
            setV((p) => ({ ...p, address: s.key }));
            setAddressSuggestions([]);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="job-value">Value (A$)</label>
          <input id="job-value" className="input" type="number" inputMode="decimal" value={v.quoteAmount} onChange={set("quoteAmount")} />
        </div>
        <div>
          <label className="label" htmlFor="job-duration">Duration (mins)</label>
          <input id="job-duration" className="input" type="number" inputMode="numeric" value={v.durationMins} onChange={set("durationMins")} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="job-scheduled-start">Scheduled start</label>
        <input id="job-scheduled-start" className="input" type="datetime-local" value={v.scheduledStart} onChange={set("scheduledStart")} />
        <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
          Setting a start while status is Accepted/Scheduled adds it to your Google Calendar.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="job-notes">Notes</label>
          <DictateButton onText={(t) => setV((p) => ({ ...p, notes: p.notes ? `${p.notes} ${t}` : t }))} />
        </div>
        <textarea id="job-notes" className="input" rows={2} value={v.notes} onChange={set("notes")} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

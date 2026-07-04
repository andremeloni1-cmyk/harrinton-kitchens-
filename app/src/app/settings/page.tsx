"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { clearQueue } from "@/lib/offline-queue";
import { NotificationsCard } from "@/components/NotificationsCard";
import { ThemeToggle } from "@/components/ThemeToggle";

type Template = { key: string; subject: string; body: string; enabled: boolean };
type SettingsData = {
  account: { name: string | null; email: string; googleEmail: string | null; calendarId: string; signature?: string | null; logo?: string | null; logoMime?: string | null; logoDark?: string | null; logoDarkMime?: string | null } | null;
  templates: Template[];
  google: { configured: boolean; connected: boolean };
  xero?: {
    configured: boolean;
    connected: boolean;
    orgName: string | null;
    bankAccountId?: string | null;
    bankAccountName?: string | null;
    expenseAccountCode?: string | null;
  };
  ai?: { configured: boolean };
};

const TEMPLATE_LABELS: Record<string, string> = {
  accepted: "Job accepted",
  moved: "Job rescheduled",
  cancelled: "Job cancelled",
  report: "Maintenance report",
};

type LeadSource = { id: string; name: string; email: string; enabled: boolean; templates?: string | null };

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState<string | null>(null);
  const [logoDarkMime, setLogoDarkMime] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceEmail, setNewSourceEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [summarising, setSummarising] = useState(false);
  async function sendWeeklySummary() {
    setSummarising(true);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; sent?: boolean; to?: string; reason?: string }>("/api/summary/weekly", { method: "POST" });
      setMsg(r.sent ? `Summary emailed to ${r.to} ✓` : r.reason || "Couldn't send the summary.");
    } catch {
      setMsg("Couldn't send the summary just now.");
    } finally {
      setSummarising(false);
    }
  }

  async function dedupeDrive() {
    setDeduping(true);
    setMsg(null);
    try {
      const r = await api<{ filesRemoved: number; foldersScanned: number }>("/api/maintenance/dedupe-drive", { method: "POST" });
      setMsg(`Cleaned up ${r.filesRemoved} duplicate file(s) across ${r.foldersScanned} folder(s).`);
    } catch {
      setMsg("Couldn't clean up duplicates just now.");
    } finally {
      setDeduping(false);
    }
  }

  async function load() {
    const d = await api<SettingsData>("/api/settings");
    setData(d);
    setName(d.account?.name || "");
    setSignature(d.account?.signature || "");
    setLogo(d.account?.logo || null);
    setLogoMime(d.account?.logoMime || null);
    setLogoDark(d.account?.logoDark || null);
    setLogoDarkMime(d.account?.logoDarkMime || null);
    setTemplates(d.templates);
    try {
      const ls = await api<{ sources: LeadSource[] }>("/api/lead-sources");
      setSources(ls.sources);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function toggleSource(s: LeadSource) {
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    await api(`/api/lead-sources/${s.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !s.enabled }) });
  }
  async function deleteSource(s: LeadSource) {
    // Optimistically remove; reload from the server if the delete fails so the
    // list reflects real state. (No window.confirm — unreliable in standalone PWAs.)
    setSources((prev) => prev.filter((x) => x.id !== s.id));
    try {
      await api(`/api/lead-sources/${s.id}`, { method: "DELETE" });
    } catch {
      load();
    }
  }
  async function addSource() {
    const email = newSourceEmail.trim().toLowerCase();
    if (!email.includes("@")) return;
    const { source } = await api<{ source: LeadSource }>("/api/lead-sources", {
      method: "POST",
      body: JSON.stringify({ email, name: newSourceName.trim() || email }),
    });
    setSources((prev) => [...prev.filter((x) => x.id !== source.id), source]);
    setNewSourceName("");
    setNewSourceEmail("");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setMsg("Google account connected ✓");
    if (params.get("xero_connected")) setMsg("Xero connected ✓");
    const err = params.get("error");
    if (err?.startsWith("xero_")) setMsg(`Couldn't connect Xero: ${err.replace("xero_", "")}`);
    else if (err) setMsg(`Couldn't connect Google: ${err}`);
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ account: { name, signature, logo, logoMime, logoDark, logoDarkMime }, templates }),
      });
      setMsg("Saved ✓");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await api("/api/auth/google/disconnect", { method: "POST" });
    await load();
  }

  async function disconnectXero() {
    await api("/api/auth/xero/disconnect", { method: "POST" });
    await load();
  }

  async function logout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    // Full teardown so no data lingers on a shared device: clear the session,
    // the offline queue, the service-worker caches, and unregister the SW.
    try {
      await clearQueue();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* best-effort — still redirect to login */
    }
    window.location.href = "/login";
  }

  function updateTemplate(key: string, patch: Partial<Template>) {
    setTemplates((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function onLogoFile(variant: "light" | "dark") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 300 * 1024) {
        setMsg("Logo too large — please use an image under 300KB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result); // data:<mime>;base64,<data>
        const comma = result.indexOf(",");
        const b64 = comma >= 0 ? result.slice(comma + 1) : result;
        const mime = file.type || "image/png";
        if (variant === "dark") {
          setLogoDark(b64);
          setLogoDarkMime(mime);
        } else {
          setLogo(b64);
          setLogoMime(mime);
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // Sample values so the preview shows what a real client would receive.
  const previewVars: Record<string, string> = {
    clientName: "Sarah Whitfield",
    jobTitle: "Kitchen worktop replacement",
    startDate: "Friday, 4 July 2026",
    startTime: "07:00",
    address: "14 Millbrook Lane, Bristol",
    reference: "JOB-1042",
    ownerName: name || "Your business",
  };
  function renderPreview(text: string): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => previewVars[k] ?? `{{${k}}}`);
  }

  if (!data) return <div className="px-4 pt-6 text-stone-400 dark:text-slate-500">Loading…</div>;

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Settings</h1>

      {msg && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{msg}</div>}

      {/* Appearance */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900 dark:text-slate-100">Appearance</h2>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-slate-400">Light, dark, or match your device.</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Google connection */}
      <div className="card mb-4 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Google integration</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Connect your Google account to sync jobs to Calendar, save PDFs to Drive and send client emails from Gmail.
        </p>

        {!data.google.configured ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            Google isn’t configured on the server yet. Add <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> to your environment (see the README), then restart the app.
          </div>
        ) : data.google.connected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-stone-700 dark:text-slate-200">Connected{data.account?.googleEmail ? ` as ${data.account.googleEmail}` : ""}</span>
            </div>
            <button className="btn-secondary" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <a href="/api/auth/google" className="btn-primary w-full">
            Connect Google account
          </a>
        )}
        {!data.google.connected && data.google.configured && (
          <p className="mt-3 rounded-lg bg-stone-50 dark:bg-night-850 px-3 py-2 text-xs text-stone-500 dark:text-slate-400">
            Until connected, the app runs in <strong>demo mode</strong>: everything works locally, but nothing is pushed to
            Google.
          </p>
        )}
      </div>

      {/* Xero connection */}
      <div className="card mb-4 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Xero integration</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Connect Xero to push invoices to your books, sync payment statuses, and see your profit &amp; loss.
        </p>

        {!data.xero?.configured ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            Xero isn’t configured on the server yet. Create an app at{" "}
            <a href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer" className="underline">
              developer.xero.com
            </a>{" "}
            and add <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> to your environment, then restart
            the app.
          </div>
        ) : data.xero.connected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-stone-700 dark:text-slate-200">
                Connected{data.xero.orgName ? ` to ${data.xero.orgName}` : ""}
              </span>
            </div>
            <button className="btn-secondary" onClick={disconnectXero}>
              Disconnect
            </button>
          </div>
        ) : (
          <a href="/api/auth/xero" className="btn-primary w-full">
            Connect Xero
          </a>
        )}

        {data.xero?.connected && (
          <XeroReceiptSettings
            bankAccountId={data.xero.bankAccountId ?? null}
            bankAccountName={data.xero.bankAccountName ?? null}
            expenseAccountCode={data.xero.expenseAccountCode ?? null}
            onSaved={load}
            onMsg={setMsg}
          />
        )}
        {data.xero?.configured && !data.xero.connected && (
          <p className="mt-3 rounded-lg bg-stone-50 dark:bg-night-850 px-3 py-2 text-xs text-stone-500 dark:text-slate-400">
            Until connected, invoices stay <strong>local only</strong> and the P&amp;L page is unavailable.
          </p>
        )}
      </div>

      {/* Push notifications */}
      <NotificationsCard />

      {/* Drive cleanup */}
      <div className="card mb-4 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Backup your data</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Download a copy of all your jobs, invoices, clients, and price list as a file — so your business data is never locked to the one server. Keep it somewhere safe.
        </p>
        <a href="/api/export" download className="btn-secondary inline-flex w-full items-center justify-center">
          Download backup (.json)
        </a>
      </div>

      {data.google.connected && (
        <div className="card mb-4 p-4">
          <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Weekly summary</h2>
          <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
            A digest of jobs completed, invoiced, paid, and overdue is emailed to you every Monday. Send one now to preview it.
          </p>
          <button className="btn-secondary w-full" onClick={sendWeeklySummary} disabled={summarising}>
            {summarising ? "Sending…" : "Email me this week’s summary"}
          </button>
        </div>
      )}

      {data.google.connected && (
        <div className="card mb-4 p-4">
          <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Drive cleanup</h2>
          <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">Remove duplicate files already sitting in your job folders (keeps the newest copy of each).</p>
          <button className="btn-secondary w-full" onClick={dedupeDrive} disabled={deduping}>
            {deduping ? "Cleaning up…" : "Remove duplicate Drive files"}
          </button>
        </div>
      )}

      {/* Incoming job sources */}
      <div className="card mb-4 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Incoming jobs</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Emails from these senders become job leads for you to approve. Add a whole{" "}
          <strong>company domain</strong> (e.g. <code>miikitchen.com.au</code>) to catch every staff member, or a
          specific email address. The app checks automatically, or tap “Check inbox for new jobs” on the Jobs screen.
        </p>

        {/* AI status — needed to split multi-job emails and read images/PDFs */}
        <div
          className={`mb-3 rounded-xl px-4 py-2.5 text-sm ${
            data.ai?.configured ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
          }`}
        >
          {data.ai?.configured ? (
            <>✓ AI reading is on — multi-job emails are split and images/PDFs are read.</>
          ) : (
            <>AI reading is <strong>off</strong>. Add <code>ANTHROPIC_API_KEY</code> to the server <code>.env</code> and reload to split multi-job emails and read images/PDFs. Until then, each email becomes a single lead.</>
          )}
        </div>
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="rounded-xl bg-stone-50 dark:bg-night-850 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-slate-100">{s.name}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-slate-400">{s.email}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
                  <input type="checkbox" checked={s.enabled} onChange={() => toggleSource(s)} className="h-4 w-4 accent-brand-600" />
                  On
                </label>
                <button onClick={() => deleteSource(s)} className="rounded-lg p-1 text-stone-400 dark:text-slate-500 hover:bg-stone-200 dark:hover:bg-night-800" aria-label="Remove">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <SourceTemplates source={s} />
            </div>
          ))}
          {sources.length === 0 && <p className="text-sm text-stone-400 dark:text-slate-500">No senders yet — add one below.</p>}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Company name" value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} />
          <input className="input" placeholder="company.com or email@company.com" value={newSourceEmail} onChange={(e) => setNewSourceEmail(e.target.value)} />
          <button className="btn-secondary" onClick={addSource}>Add</button>
        </div>
      </div>

      {/* Account */}
      <div className="card mb-4 p-4">
        <h2 className="mb-3 font-semibold text-stone-900 dark:text-slate-100">Your business</h2>
        <label className="label">Name (used in emails & reports)</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harrington Kitchens" />
        <label className="label mt-3">Email signature</label>
        <textarea
          className="input"
          rows={3}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={"Added to the bottom of every client email, e.g.\nHarrington Kitchens\n0400 000 000"}
        />
        <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Appended to all automated client emails. Save settings to apply.</p>

        <label className="label mt-3">Logo (light backgrounds)</label>
        {logo ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:${logoMime || "image/png"};base64,${logo}`} alt="Logo" className="max-h-16 rounded bg-white p-1 ring-1 ring-stone-200 dark:ring-night-line" />
            <button className="btn-secondary" onClick={() => { setLogo(null); setLogoMime(null); }}>Remove</button>
          </div>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onLogoFile("light")} className="block w-full text-sm text-stone-600 dark:text-slate-300" />
        )}
        <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Used in client emails, the app in light mode, and report PDFs. PNG/JPG under 300KB.</p>

        <label className="label mt-3">Logo (dark backgrounds)</label>
        {logoDark ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:${logoDarkMime || "image/png"};base64,${logoDark}`} alt="Dark-mode logo" className="max-h-16 rounded bg-stone-900 p-1 ring-1 ring-stone-200 dark:ring-night-line" />
            <button className="btn-secondary" onClick={() => { setLogoDark(null); setLogoDarkMime(null); }}>Remove</button>
          </div>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onLogoFile("dark")} className="block w-full text-sm text-stone-600 dark:text-slate-300" />
        )}
        <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">A light/white version of your logo for dark mode and the PDF header. Falls back to the logo above if not set. Save settings to apply.</p>
      </div>

      {/* Email templates */}
      <div className="card mb-4 p-4">
        <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Automated emails</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Sent automatically to clients. Use placeholders like{" "}
          <code>{"{{clientName}}"}</code>, <code>{"{{jobTitle}}"}</code>, <code>{"{{startDate}}"}</code>,{" "}
          <code>{"{{startTime}}"}</code>, <code>{"{{address}}"}</code>, <code>{"{{reference}}"}</code>.
        </p>
        <div className="space-y-4">
          {templates.map((t) => (
            <details key={t.key} className="rounded-xl border border-stone-200 dark:border-night-line">
              <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm font-semibold text-stone-800 dark:text-slate-100">
                {TEMPLATE_LABELS[t.key] || t.key}
                <label className="flex items-center gap-2 text-xs font-normal text-stone-500 dark:text-slate-400" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => updateTemplate(t.key, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Enabled
                </label>
              </summary>
              <div className="space-y-2 px-3 pb-3">
                <input
                  className="input"
                  value={t.subject}
                  onChange={(e) => updateTemplate(t.key, { subject: e.target.value })}
                  placeholder="Subject"
                />
                <textarea
                  className="input"
                  rows={6}
                  value={t.body}
                  onChange={(e) => updateTemplate(t.key, { body: e.target.value })}
                />
                {/* Live preview — placeholders filled with sample client details */}
                <div className="rounded-xl bg-stone-50 dark:bg-night-850 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Preview</p>
                  <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{renderPreview(t.subject) || "(no subject)"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600 dark:text-slate-300">{renderPreview(t.body)}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <button className="btn-primary mb-4 w-full" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </button>

      <button className="btn-ghost w-full text-stone-500 dark:text-slate-400" onClick={logout}>
        Log out
      </button>

      <p className="mt-6 text-center text-xs text-stone-300 dark:text-slate-600">Harrington Kitchens · v1.0</p>
    </div>
  );
}

type XeroBankAccount = { accountId: string; name: string; code?: string };

/** Chooses which Xero bank account captured receipts post to (as spend-money)
 * and the expense account code, so pushes land ready to reconcile. */
function XeroReceiptSettings({
  bankAccountId,
  bankAccountName,
  expenseAccountCode,
  onSaved,
  onMsg,
}: {
  bankAccountId: string | null;
  bankAccountName: string | null;
  expenseAccountCode: string | null;
  onSaved: () => Promise<void> | void;
  onMsg: (m: string) => void;
}) {
  const [accounts, setAccounts] = useState<XeroBankAccount[] | null>(null);
  const [selected, setSelected] = useState(bankAccountId || "");
  const [code, setCode] = useState(expenseAccountCode || "");
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    api<{ accounts: XeroBankAccount[]; connected: boolean; error?: string }>("/api/xero/bank-accounts")
      .then((r) => {
        setAccounts(r.accounts);
        setHint(r.error || (r.accounts.length === 0 ? "No bank accounts found in Xero." : null));
      })
      .catch(() => {
        setAccounts([]);
        setHint("Couldn’t load your Xero bank accounts. Disconnect and Connect Xero again to grant access.");
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const name = accounts?.find((a) => a.accountId === selected)?.name || bankAccountName || null;
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          account: {
            xeroBankAccountId: selected || null,
            xeroBankAccountName: name,
            xeroExpenseAccountCode: code || null,
          },
        }),
      });
      onMsg("Receipt settings saved ✓");
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-stone-100 pt-4 dark:border-night-line">
      <h3 className="mb-1 text-sm font-semibold text-stone-800 dark:text-slate-200">Receipts → spend-money</h3>
      <p className="mb-3 text-xs text-stone-500 dark:text-slate-400">
        Captured receipts post to this bank account so they’re a one-tap reconcile against your bank feed.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Bank account</span>
        <select className="input w-full" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!accounts}>
          <option value="">{accounts ? "— choose an account —" : "Loading…"}</option>
          {accounts?.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.name}{a.code ? ` (${a.code})` : ""}
            </option>
          ))}
        </select>
        {accounts && accounts.length === 0 && hint && (
          <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">{hint}</span>
        )}
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Expense account code (optional)</span>
        <input className="input w-full" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 400" />
      </label>
      <button className="btn-secondary mt-3 w-full" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save receipt settings"}
      </button>
    </div>
  );
}

type Override = { subject?: string; body?: string };
const OVERRIDE_KEYS: { key: string; label: string }[] = [
  { key: "accepted", label: "Job confirmed" },
  { key: "moved", label: "Rescheduled" },
  { key: "cancelled", label: "Cancelled" },
];

/** Per-company email wording overrides. Blank fields fall back to the defaults. */
function SourceTemplates({ source }: { source: LeadSource }) {
  const [tpl, setTpl] = useState<Record<string, Override>>(() => {
    try {
      return source.templates ? JSON.parse(source.templates) : {};
    } catch {
      return {};
    }
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setField = (k: string, f: keyof Override, v: string) =>
    setTpl((p) => ({ ...p, [k]: { ...(p[k] || {}), [f]: v } }));

  async function save() {
    setSaving(true);
    try {
      await api(`/api/lead-sources/${source.id}`, { method: "PATCH", body: JSON.stringify({ templates: tpl }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-2 rounded-lg border border-stone-200 dark:border-night-line bg-white dark:bg-night-900">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-stone-600 dark:text-slate-300">Custom emails for this client</summary>
      <div className="space-y-3 px-3 pb-3">
        <p className="text-xs text-stone-400 dark:text-slate-500">
          Leave blank to use the defaults. Placeholders like <code>{"{{clientName}}"}</code> and <code>{"{{startDate}}"}</code> work here too.
        </p>
        {OVERRIDE_KEYS.map(({ key, label }) => (
          <div key={key}>
            <p className="text-xs font-semibold text-stone-600 dark:text-slate-300">{label}</p>
            <input
              className="input mt-1"
              placeholder="Subject (optional)"
              value={tpl[key]?.subject || ""}
              onChange={(e) => setField(key, "subject", e.target.value)}
            />
            <textarea
              className="input mt-1"
              rows={3}
              placeholder="Body (optional)"
              value={tpl[key]?.body || ""}
              onChange={(e) => setField(key, "body", e.target.value)}
            />
          </div>
        ))}
        <button className="btn-secondary w-full" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save custom emails"}
        </button>
      </div>
    </details>
  );
}

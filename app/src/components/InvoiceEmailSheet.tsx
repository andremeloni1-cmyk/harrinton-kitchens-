"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/job";

export type EmailMode = "invoice" | "reminder";

type Draft = {
  to: string;
  cc: string;
  subject: string;
  message: string;
  googleConnected: boolean;
  /** Reminder only — the single-use token minted with the preview. */
  token?: string;
  alreadySent?: string | null;
  lastRemindedAt?: string | null;
  overdue?: boolean;
  attachmentName?: string;
};

/**
 * Compose sheet for emailing an invoice or chasing payment.
 *
 * The office always sees and can edit exactly what is going out — there is no
 * one-tap send. For reminders that is enforced server-side too: the preview
 * mints a single-use token the send requires, so a double-tap or a retry on a
 * flaky connection can't chase a client twice.
 */
export function InvoiceEmailSheet({
  invoiceId,
  invoiceNumber,
  mode,
  onClose,
  onSent,
}: {
  invoiceId: string;
  invoiceNumber: string;
  mode: EmailMode;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = mode === "invoice" ? "email" : "reminder";

  useEffect(() => {
    let active = true;
    api<Draft>(`/api/invoices/${invoiceId}/${path}`)
      .then((d) => {
        if (active) setDraft(d);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't open that.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invoiceId, path]);

  async function send() {
    if (!draft) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/invoices/${invoiceId}/${path}`, {
        method: "POST",
        body: JSON.stringify({
          to: draft.to,
          cc: draft.cc,
          subject: draft.subject,
          message: draft.message,
          ...(draft.token ? { token: draft.token } : {}),
        }),
      });
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  const title = mode === "invoice" ? `Email ${invoiceNumber}` : `Chase ${invoiceNumber}`;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Modal open onClose={onClose} title={title}>
      {loading ? (
        <p className="text-sm text-stone-500 dark:text-slate-400">Loading…</p>
      ) : !draft ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error || "Couldn't open that."}</p>
      ) : (
        <div className="space-y-3">
          {!draft.googleConnected && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Connect Google in Settings first — this is sent from your Gmail.
            </p>
          )}
          {mode === "invoice" && draft.alreadySent && (
            <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-night-800 dark:text-slate-300">
              Already emailed {new Date(draft.alreadySent).toLocaleDateString("en-AU")}. Sending again is fine.
            </p>
          )}
          {mode === "reminder" && !draft.overdue && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              This invoice isn&apos;t overdue — there&apos;s nothing to chase.
            </p>
          )}
          {mode === "reminder" && draft.lastRemindedAt && (
            <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-night-800 dark:text-slate-300">
              Last chased {new Date(draft.lastRemindedAt).toLocaleDateString("en-AU")}.
            </p>
          )}

          <Field label="To">
            <input className="input w-full" value={draft.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="Copy to">
            <input className="input w-full" value={draft.cc} onChange={(e) => set({ cc: e.target.value })} />
          </Field>
          <Field label="Subject">
            <input className="input w-full" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea
              className="input min-h-[180px] w-full resize-y"
              value={draft.message}
              onChange={(e) => set({ message: e.target.value })}
            />
          </Field>

          <p className="text-xs text-stone-400 dark:text-slate-500">
            📎 {draft.attachmentName || `Invoice-${invoiceNumber}.pdf`} attached
          </p>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            className="btn-primary w-full"
            disabled={sending || !draft.googleConnected || !draft.to.trim()}
            onClick={send}
          >
            {sending ? "Sending…" : mode === "invoice" ? "Send invoice" : "Send reminder"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

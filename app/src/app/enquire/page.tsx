"use client";

import { useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { PROJECT_TYPES } from "@/lib/enquiry";

export default function EnquirePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [projectType, setProjectType] = useState<string>("");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("email", email);
      fd.set("phone", phone);
      fd.set("projectType", projectType);
      fd.set("details", details);
      fd.set("company_website", honeypot.current?.value || "");
      for (const p of photos) fd.append("photos", p);
      const res = await fetch("/api/enquire", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong — please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10">
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">Thanks — we’ve got it</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
              Your enquiry is with the team and we’ll be in touch soon. Keep an eye on your{" "}
              {email ? "inbox" : "phone"}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-4">
      <div className="mb-6 text-center">
        <div className="mb-3 flex justify-center">
          <Brand variant="hero" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Start your project</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          Tell us a little about what you’re after and we’ll get straight back to you.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* Honeypot: hidden from people, catnip for bots. */}
        <input
          ref={honeypot}
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <Field label="Your name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Jane Smith" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="jane@example.com" />
          </Field>
          <Field label="Phone">
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="0400 000 000" />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-stone-400 dark:text-slate-500">Add at least one so we can reply.</p>

        <Field label="What are you after?">
          <select className="input" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
            <option value="">Choose a project type…</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <Field label="Tell us about it">
          <textarea
            className="input min-h-[120px] resize-y"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Rough size, style, timeframe, budget — whatever you know so far."
          />
        </Field>

        <Field label="Photos or plans (optional)">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 10))}
            className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 dark:text-slate-300 dark:file:bg-brand-500/15 dark:file:text-brand-300"
          />
          {photos.length > 0 && (
            <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400">
              {photos.length} photo{photos.length === 1 ? "" : "s"} attached
            </p>
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-accent w-full">
          {busy ? "Sending…" : "Send enquiry"}
        </button>
        <p className="text-center text-xs text-stone-400 dark:text-slate-500">
          We’ll only use your details to reply to this enquiry.
        </p>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-slate-200">
        {label}
        {required && <span className="text-brand-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PhotoUpload } from "@/components/PhotoUpload";
import { DictateButton } from "@/components/DictateButton";
import { SignaturePad } from "@/components/SignaturePad";
import { api, type JobDTO, type ReportDTO } from "@/lib/job";
import type { ReportData } from "@/lib/pdf";
import { REPORT_TEMPLATES, roomFromTemplate, type TemplateKey } from "@/lib/report-templates";

type FlatKey = Exclude<keyof ReportData, "rooms">;

// Maintenance-style fields, kept available but tucked into a collapsible section.
const MAINT_FIELDS: { key: FlatKey; label: string; type: "text" | "textarea" | "date" | "select" }[] = [
  { key: "engineer", label: "Engineer / fitter", type: "text" },
  { key: "visitDate", label: "Visit date", type: "date" },
  { key: "findings", label: "Findings", type: "textarea" },
  { key: "materialsUsed", label: "Materials used", type: "textarea" },
  { key: "recommendations", label: "Recommendations", type: "textarea" },
  { key: "condition", label: "Overall condition", type: "select" },
  { key: "nextServiceDate", label: "Next service due", type: "date" },
];

export function ReportEditor({
  job,
  existing,
  onSaved,
  installerId,
}: {
  job: JobDTO;
  existing?: ReportDTO | null;
  onSaved: () => void;
  /** Set when the report is filed from the installer portal — recorded on the report. */
  installerId?: string;
}) {
  const [data, setData] = useState<ReportData>(() => {
    let init: ReportData = {};
    try {
      init = existing?.data ? JSON.parse(existing.data) : {};
    } catch {
      init = {};
    }
    // Default the Site-photos link to the job's uploaded-photos folder so the
    // report links the dashboard photos automatically (no need to paste it).
    if (!init.driveImagesLink && job.drivePhotosFolderId) {
      init.driveImagesLink = `https://drive.google.com/drive/folders/${job.drivePhotosFolderId}`;
    }
    return init;
  });
  const [reportId, setReportId] = useState<string | undefined>(existing?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // Web Share with files — the phone's native share sheet (text/WhatsApp/email).
    setCanShare(typeof navigator !== "undefined" && typeof navigator.canShare === "function");
  }, []);

  const set = (k: FlatKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setData((p) => ({ ...p, [k]: e.target.value }));

  const rooms = data.rooms || [];
  const patchRooms = (fn: (rooms: NonNullable<ReportData["rooms"]>) => NonNullable<ReportData["rooms"]>) =>
    setData((p) => ({ ...p, rooms: fn(p.rooms || []) }));
  const setRoom = (i: number, patch: Partial<NonNullable<ReportData["rooms"]>[number]>) =>
    patchRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRoom = (i: number) => patchRooms((rs) => rs.filter((_, idx) => idx !== i));
  const addRoom = () => patchRooms((rs) => [...rs, { name: "", work: "", items: [] }]);
  const addTemplate = (key: TemplateKey) => patchRooms((rs) => [...rs, roomFromTemplate(key)]);

  const setItem = (ri: number, ii: number, patch: Partial<{ label: string; done: boolean }>) =>
    patchRooms((rs) =>
      rs.map((r, idx) =>
        idx === ri ? { ...r, items: (r.items || []).map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : r
      )
    );
  const addItem = (ri: number) =>
    patchRooms((rs) => rs.map((r, idx) => (idx === ri ? { ...r, items: [...(r.items || []), { label: "", done: false }] } : r)));
  const removeItem = (ri: number, ii: number) =>
    patchRooms((rs) => rs.map((r, idx) => (idx === ri ? { ...r, items: (r.items || []).filter((_, j) => j !== ii) } : r)));

  // Unticked room checklist items — offered as a one-tap fill for the
  // "Still to be completed" list so the fitter doesn't retype them.
  const unticked = rooms.flatMap((r) =>
    (r.items || [])
      .filter((it) => !it.done && it.label.trim())
      .map((it) => (r.name ? `${r.name}: ${it.label.trim()}` : it.label.trim()))
  );
  function pullOutstanding() {
    setData((p) => {
      const existing = (p.outstandingWorks || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const merged = [...existing];
      for (const line of unticked) if (!merged.includes(line)) merged.push(line);
      return { ...p, outstandingWorks: merged.join("\n") };
    });
  }

  async function autofill() {
    setBusy("autofill");
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; data?: ReportData; message?: string }>(
        `/api/jobs/${job.id}/report/autofill`,
        { method: "POST" }
      );
      if (res.ok && res.data) {
        // Merge AI draft over empty fields, keeping anything already typed.
        setData((p) => ({
          ...res.data,
          ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== "" && !Array.isArray(v))),
          rooms: p.rooms && p.rooms.length ? p.rooms : res.data!.rooms || [],
        }));
        setMsg("Scope detected and draft filled in — review, tick off items, and edit before sending.");
      } else {
        setMsg(res.message || "Couldn't auto-fill right now.");
      }
    } finally {
      setBusy(null);
    }
  }

  // Generate the PDF and hand it to the phone's native share sheet (text,
  // WhatsApp, email…). Falls back to a download where sharing files isn't
  // supported.
  async function share() {
    setBusy("share");
    setMsg(null);
    try {
      const res = await api<{ report: ReportDTO; pdfBase64?: string; filename?: string }>(
        `/api/jobs/${job.id}/report`,
        { method: "POST", body: JSON.stringify({ reportId, data, action: "generate", installerId }) }
      );
      setReportId(res.report.id);
      onSaved();
      if (!res.pdfBase64 || !res.filename) return setMsg("Couldn't build the PDF to share.");
      const file = new File([b64ToBlob(res.pdfBase64, "application/pdf")], res.filename, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: res.filename, text: `${job.title} — maintenance report` });
      } else {
        // Fall back to a download.
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
        setMsg("Sharing files isn't supported here — the PDF was downloaded instead.");
      }
    } catch (e) {
      // A user cancelling the share sheet throws AbortError — ignore it.
      if (e instanceof Error && e.name !== "AbortError") setMsg("Couldn't share the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: "save" | "generate" | "send") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await api<{ report: ReportDTO; pdfBase64?: string; filename?: string }>(
        `/api/jobs/${job.id}/report`,
        { method: "POST", body: JSON.stringify({ reportId, data, action: action === "save" ? undefined : action, installerId }) }
      );
      setReportId(res.report.id);
      if (res.pdfBase64 && res.filename) {
        const blob = b64ToBlob(res.pdfBase64, "application/pdf");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setMsg(
        action === "send"
          ? job.clientEmail
            ? "Report generated and emailed to the client."
            : "Report generated (no client email on file)."
          : action === "generate"
          ? "Report PDF generated and downloaded."
          : "Draft saved."
      );
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  // Only ever offer the shared "Photos (client)" folder as a client link — never
  // the main job folder, which also holds private plans/POs. When no photos
  // folder exists yet, this is empty and the server creates + links it on send.
  const photosFolderLink = job.drivePhotosFolderId
    ? `https://drive.google.com/drive/folders/${job.drivePhotosFolderId}`
    : "";

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-100 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30 dark:hover:bg-brand-500/25"
        disabled={!!busy}
        onClick={autofill}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy === "autofill" ? "Detecting scope…" : "Auto-fill & detect scope"}
      </button>

      <div>
        <label className="label">Scope of work</label>
        <input className="input" value={data.scope || ""} onChange={set("scope")} placeholder="e.g. Kitchen installation" />
      </div>

      {/* Pre-built checklists */}
      <div>
        <span className="label">Add a room checklist</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {REPORT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => addTemplate(t.key)}
              className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 dark:bg-night-800 dark:text-slate-200 dark:hover:bg-night-850"
            >
              + {t.label}
            </button>
          ))}
          <button type="button" onClick={addRoom} className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200">
            + Blank room
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label">Overall summary</label>
          <DictateButton onText={(t) => setData((p) => ({ ...p, workCarried: p.workCarried ? `${p.workCarried} ${t}` : t }))} />
        </div>
        <textarea className="input" rows={3} value={data.workCarried || ""} onChange={set("workCarried")} placeholder="Short summary of the work done" />
      </div>

      {/* Rooms with completion checklist */}
      {rooms.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-slate-500">Add a room above (or use Auto-fill) to build a completion checklist.</p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room, ri) => {
            const items = room.items || [];
            const done = items.filter((it) => it.done).length;
            const outstanding = items.length - done;
            return (
              <div key={ri} className="rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 dark:bg-night-850 dark:ring-night-line">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Room / area (e.g. Kitchen)"
                    value={room.name}
                    onChange={(e) => setRoom(ri, { name: e.target.value })}
                  />
                  <button type="button" onClick={() => removeRoom(ri)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 dark:text-slate-500 dark:hover:bg-night-800" aria-label="Remove room">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {items.length > 0 && (
                  <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-slate-400">
                    {done}/{items.length} complete
                    {outstanding > 0 && <span className="text-amber-600 dark:text-amber-400"> · {outstanding} to do</span>}
                  </p>
                )}

                <div className="space-y-1.5">
                  {items.map((it, ii) => (
                    <div key={ii} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={(e) => setItem(ri, ii, { done: e.target.checked })}
                        className="h-5 w-5 shrink-0 rounded accent-emerald-600"
                      />
                      <input
                        className={`input flex-1 ${it.done ? "text-stone-400 line-through dark:text-slate-500" : ""}`}
                        value={it.label}
                        placeholder="Checklist item"
                        onChange={(e) => setItem(ri, ii, { label: e.target.value })}
                      />
                      <button type="button" onClick={() => removeItem(ri, ii)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 dark:text-slate-500 dark:hover:bg-night-800" aria-label="Remove item">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addItem(ri)} className="mt-1.5 text-xs font-semibold text-brand-600">
                  + Add item
                </button>

                <textarea
                  className="input mt-2"
                  rows={2}
                  placeholder="Notes for this room (optional)"
                  value={room.work || ""}
                  onChange={(e) => setRoom(ri, { work: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Outstanding works — what still needs doing, shown prominently on the
          report so the company knows exactly what's left. */}
      <div>
        <label className="label">Still to be completed</label>
        <textarea
          className="input"
          rows={3}
          value={data.outstandingWorks || ""}
          onChange={set("outstandingWorks")}
          placeholder={"One item per line, e.g.\nHandles to be fitted once supplied\nBenchtop join to be sealed on return visit"}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-xs text-stone-400 dark:text-slate-500">
            Listed in a highlighted box on the report so the company sees what’s left.
          </p>
          {unticked.length > 0 && (
            <button type="button" onClick={pullOutstanding} className="shrink-0 text-xs font-semibold text-brand-600">
              Add {unticked.length} unticked item{unticked.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>

      {/* Site photos — upload straight from here; they land in the job's shared
          Drive folder and the report links to it automatically. */}
      <div>
        <label className="label">Site photos</label>
        <PhotoUpload job={job} onChanged={onSaved} />
      </div>

      {/* Site photos (Google Drive link) */}
      <div>
        <label className="label">Photos link on the report</label>
        <input
          className="input"
          value={data.driveImagesLink || ""}
          onChange={set("driveImagesLink")}
          placeholder="Paste a Google Drive folder link"
        />
        {photosFolderLink && data.driveImagesLink !== photosFolderLink && (
          <button
            type="button"
            onClick={() => setData((p) => ({ ...p, driveImagesLink: photosFolderLink }))}
            className="mt-1 text-xs font-semibold text-brand-600"
          >
            Use this job’s photos folder
          </button>
        )}
        {job.drivePhotosFolderId && data.driveImagesLink === photosFolderLink && (
          <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
            Linked to this job’s uploaded photos — clients can view them from the report.
          </p>
        )}
        {!job.drivePhotosFolderId && !data.driveImagesLink && (
          <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
            On send, a private “Photos (client)” folder is shared with the client — only those images are visible, never your plans or other jobs.
          </p>
        )}
      </div>

      {/* Maintenance details — optional */}
      <details className="rounded-xl border border-stone-200 dark:border-night-line">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-stone-700 dark:text-slate-200">Maintenance details (optional)</summary>
        <div className="space-y-2 px-3 pb-3">
          {MAINT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.type === "textarea" ? (
                <textarea className="input" rows={2} value={data[f.key] || ""} onChange={set(f.key)} />
              ) : f.type === "select" ? (
                <select className="input" value={data[f.key] || ""} onChange={set(f.key)}>
                  <option value="">Select…</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Needs attention">Needs attention</option>
                </select>
              ) : (
                <input className="input" type={f.type} value={data[f.key] || ""} onChange={set(f.key)} />
              )}
            </div>
          ))}
        </div>
      </details>

      {/* Client sign-off */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Signed off by (client)</label>
          <input className="input" value={data.signOffName || ""} onChange={set("signOffName")} placeholder="Client name" />
        </div>
        <div>
          <label className="label">Sign-off date</label>
          <input className="input" type="date" value={data.signOffDate || ""} onChange={set("signOffDate")} />
        </div>
      </div>

      {/* Signature — the client signs on-screen with a finger; it goes on the PDF. */}
      <div>
        <label className="label">Client signature</label>
        <SignaturePad
          value={data.signOffSignature}
          onChange={(dataUrl) => setData((p) => ({ ...p, signOffSignature: dataUrl || undefined }))}
        />
      </div>

      {msg && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-night-800 dark:text-slate-300">{msg}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button className="btn-secondary" disabled={!!busy} onClick={() => run("save")}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button className="btn-secondary" disabled={!!busy} onClick={() => run("generate")}>
          {busy === "generate" ? "…" : "Download PDF"}
        </button>
        {canShare && (
          <button className="btn-secondary" disabled={!!busy} onClick={share}>
            {busy === "share" ? "…" : "Share PDF"}
          </button>
        )}
        <button className="btn-primary" disabled={!!busy} onClick={() => run("send")}>
          {busy === "send" ? "Sending…" : "Generate & email"}
        </button>
      </div>
    </div>
  );
}

function b64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { logActivity } from "@/lib/automations";
import { sendEmail } from "@/lib/google/gmail";
import { analyzeJobImages } from "@/lib/vision";
import { rememberContact } from "@/lib/contacts";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";
import { validateEnquiry, isHoneypotTripped, sniffImageType, enquiryTitle } from "@/lib/enquiry";
import type { Job } from "@prisma/client";

export const dynamic = "force-dynamic";

// Public endpoint (no auth — see proxy.ts matcher), so keep the limits tight.
const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 15 * 1024 * 1024;
const MAX_BYTES_TOTAL = 40 * 1024 * 1024;

type EnquiryPhoto = { name: string; data: Buffer; mimeType: string };

function readPhotos(files: File[]): Promise<EnquiryPhoto[]> {
  return (async () => {
    const out: EnquiryPhoto[] = [];
    let total = 0;
    for (const f of files.slice(0, MAX_FILES)) {
      if (f.size > MAX_BYTES_PER_FILE) continue;
      total += f.size;
      if (total > MAX_BYTES_TOTAL) break;
      const data = Buffer.from(await f.arrayBuffer());
      const mimeType = sniffImageType(data);
      if (!mimeType) continue; // trust the bytes, not the declared type
      const base = (f.name || "photo").split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
      out.push({ name: base || `photo-${out.length + 1}.jpg`, data, mimeType });
    }
    return out;
  })();
}

// Best-effort office notification: push to staff devices and email the account
// inbox. Never blocks the enquiry (a public visitor must always get a success).
async function notifyOffice(job: Job, name: string, photoCount: number): Promise<void> {
  await sendPush({
    title: `${BRAND.name} — new enquiry`,
    body: `${name}: ${job.title}`,
    url: `/jobs/${job.id}`,
  }).catch(() => {});
  const settings = await prisma.companySettings.findFirst().catch(() => null);
  if (settings?.email) {
    const lines = [
      `New enquiry from your website.`,
      ``,
      `Name: ${name}`,
      job.clientEmail ? `Email: ${job.clientEmail}` : null,
      job.clientPhone ? `Phone: ${job.clientPhone}` : null,
      photoCount ? `Photos: ${photoCount}` : null,
      ``,
      job.description || "(no details provided)",
      ``,
      `Reference: ${job.reference}`,
    ].filter((l) => l !== null);
    await sendEmail({
      to: settings.email,
      subject: `New enquiry — ${job.title}`,
      body: lines.join("\n"),
    }).catch(() => {});
  }
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Invalid submission." }, 400);

  // Spam honeypot: a hidden field only a bot fills. Return success so bots can't
  // distinguish a drop from a save, but create nothing.
  if (isHoneypotTripped(form.get("company_website"))) return json({ ok: true });

  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  const projectType = String(form.get("projectType") || "").trim();
  const details = String(form.get("details") || "").trim();

  const v = validateEnquiry({ name, email, phone });
  if (!v.ok) return json({ error: v.error }, 400);

  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  const photos = await readPhotos(files);

  // AI Capture: read the photos into a draft title/brief the office reviews
  // (best-effort — no key / refusal just leaves the client's own words).
  let aiTitle: string | undefined;
  let aiDescription: string | undefined;
  if (photos.length > 0) {
    const read = await analyzeJobImages(
      photos.map((p) => ({ filename: p.name, data: p.data, mimeType: p.mimeType }))
    ).catch(() => null);
    if (read) {
      aiTitle = read.title;
      aiDescription = read.description;
    }
  }

  // Reuse an existing client with the same email, else create one.
  const existing = email
    ? await prisma.client.findFirst({ where: { email } }).catch(() => null)
    : null;
  const client =
    existing ??
    (await prisma.client.create({
      data: { name, email: email || null, phone: phone || null },
    }));

  const title = enquiryTitle({ aiTitle, projectType });
  const description =
    [details, aiDescription ? `— From photos —\n${aiDescription}` : null]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000) || null;

  const job = await createJobWithReference((reference) => ({
    reference,
    title,
    description,
    status: "lead",
    pipelineStage: "ENQUIRY",
    clientId: client.id,
    clientName: name,
    clientEmail: email || null,
    clientPhone: phone || null,
    leadSource: "website",
  }));

  // Attach the photos as inline documents (base64 — no Google Drive needed, so
  // the portal and job page can serve them straight away).
  for (const p of photos) {
    await prisma.document.create({
      data: {
        jobId: job.id,
        name: p.name,
        source: "upload",
        mimeType: p.mimeType,
        fileData: p.data.toString("base64"),
      },
    });
  }

  await rememberContact({ name, email: email || null, phone: phone || null }).catch(() => {});
  await logActivity(
    job.id,
    "lead",
    `New enquiry from the website${photos.length ? ` with ${photos.length} photo(s)` : ""}`
  );
  await notifyOffice(job, name, photos.length).catch(() => {});

  return json({ ok: true }, 201);
}

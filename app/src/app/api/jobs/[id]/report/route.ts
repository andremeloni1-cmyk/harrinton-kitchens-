import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { generateReportPdf, type ReportData } from "@/lib/pdf";
import { uploadToJobFolder, ensureJobPhotosFolder } from "@/lib/google/drive";
import { sendEmail } from "@/lib/google/gmail";
import { resolveTemplate, jobTemplateVars } from "@/lib/email-templates";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Create or update a maintenance report draft.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: ReportData = body.data || {};
  const reportId: string | undefined = body.reportId;

  // When filed from the installer portal, record who filed it (ignore bad ids).
  let installerId: string | null = null;
  if (typeof body.installerId === "string" && body.installerId) {
    const installer = await prisma.installer.findUnique({ where: { id: body.installerId } });
    installerId = installer?.id || null;
  }

  let report;
  if (reportId) {
    report = await prisma.maintenanceReport.update({
      where: { id: reportId },
      data: { data: JSON.stringify(data), ...(installerId ? { installerId } : {}) },
    });
  } else {
    report = await prisma.maintenanceReport.create({
      data: { jobId: job.id, data: JSON.stringify(data), installerId },
    });
  }

  // Action: generate the PDF and (optionally) email it to the client.
  if (body.action === "generate" || body.action === "send") {
    const account = await prisma.companySettings.findFirst();

    // Make sure the report's "Site photos" link points at a folder the client
    // can actually open. We only ever share the dedicated "Photos (client)"
    // subfolder (the main job folder stays private), so: ensure it exists + is
    // shared, and use its link when the report has no link or still points at
    // the private main job folder. This runs for Download too, not just Email.
    const photos = await ensureJobPhotosFolder(job).catch(() => null);
    if (photos) {
      // The Photos (client) subfolder is the ONLY thing we ever make publicly
      // viewable. So the client-facing link must never point at one of our own
      // private folders — the main job folder (plans/POs/quotes) or the root
      // folder that holds *every* job. Replace those (and an empty link) with the
      // safe shared photos link; a genuinely external link the owner pasted is
      // left untouched.
      const folderLink = (id?: string | null) => (id ? `https://drive.google.com/drive/folders/${id}` : "");
      const norm = (u?: string) => (u || "").trim().split("?")[0].replace(/\/+$/, "");
      const privateLinks = new Set(
        [folderLink(job.driveFolderId), folderLink(account?.driveFolderId)].map(norm).filter(Boolean)
      );
      const current = norm(data.driveImagesLink);
      if (!current || privateLinks.has(current)) {
        data.driveImagesLink = photos.link;
      }
      // Persist the corrected link onto the saved report.
      await prisma.maintenanceReport.update({
        where: { id: report.id },
        data: { data: JSON.stringify(data) },
      });
      if (!photos.shared) {
        await logActivity(
          job.id,
          "drive",
          "Photos folder could not be made public — your Google account may block 'anyone with link' sharing. Clients won't be able to open the link."
        );
      }
    }

    // The header band is dark, so prefer the dark-background logo variant.
    const logoB64 = account?.logoDark || account?.logo;
    const logoMime = account?.logoDark ? account?.logoDarkMime : account?.logoMime;
    let pdf: Buffer;
    try {
      pdf = await generateReportPdf(
        {
          jobTitle: job.title,
          reference: job.reference,
          clientName: job.clientName,
          address: job.address,
          ownerName: account?.name,
          logo: logoB64 ? { base64: logoB64, mime: logoMime || "image/png" } : null,
        },
        data
      );
    } catch (e) {
      // Log the detail server-side; return a generic message (the draft is saved).
      console.error("report PDF generation failed:", e);
      return json({ ok: false, error: "Couldn't build the report PDF.", report }, 500);
    }
    const filename = `Maintenance-Report-${job.reference}.pdf`;

    // Save a copy to the job's Drive folder (no-op in demo mode).
    const uploaded = await uploadToJobFolder(job, filename, pdf, "application/pdf");
    if (uploaded) {
      await prisma.maintenanceReport.update({
        where: { id: report.id },
        data: { driveFileId: uploaded.fileId, webViewLink: uploaded.webViewLink },
      });
      // Reuse the existing document row for this report file (regenerating a
      // report updates the same file rather than adding another).
      const existingDoc = await prisma.document.findFirst({ where: { jobId: job.id, name: filename } });
      if (existingDoc) {
        await prisma.document.update({
          where: { id: existingDoc.id },
          data: { driveFileId: uploaded.fileId, webViewLink: uploaded.webViewLink },
        });
      } else {
        await prisma.document.create({
          data: {
            jobId: job.id,
            name: filename,
            driveFileId: uploaded.fileId,
            webViewLink: uploaded.webViewLink,
            source: "report",
          },
        });
      }
      await logActivity(job.id, "report", "Saved maintenance report to Google Drive");
    }

    if (body.action === "send" && job.clientEmail) {
      const tpl = await resolveTemplate(
        job,
        "report",
        jobTemplateVars(job, account?.name || "The Workshop")
      );
      const sent = await sendEmail({
        to: job.clientEmail,
        subject: tpl?.subject || `Maintenance report — ${job.reference}`,
        body: tpl?.body || "Please find your maintenance report attached.",
        attachment: { filename, data: pdf, mimeType: "application/pdf" },
      });
      await prisma.maintenanceReport.update({
        where: { id: report.id },
        data: { status: "sent", sentAt: new Date() },
      });
      await logActivity(
        job.id,
        "report",
        sent
          ? `Emailed maintenance report to ${job.clientEmail}`
          : `Report ready (demo mode — connect Google to email it)`
      );
    }

    // Return the PDF bytes so the UI can offer an immediate download.
    return json({
      report: await prisma.maintenanceReport.findUnique({ where: { id: report.id } }),
      pdfBase64: pdf.toString("base64"),
      filename,
    });
  }

  return json({ report });
}

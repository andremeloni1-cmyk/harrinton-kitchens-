import { google } from "googleapis";
import { Readable } from "node:stream";
import { getAuthorizedClient } from "./oauth";
import { prisma } from "@/lib/db";

const ROOT_FOLDER_NAME = "Harrington Kitchens Jobs";

// Escape a value for safe interpolation into a Drive `q` string literal.
// Backslash must be escaped first, then the single-quote delimiter — otherwise
// a name ending in a backslash could escape the closing quote.
const escapeDriveQuery = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Finds (or creates) the root Drive folder where all job folders live. */
async function ensureRootFolder(auth: any): Promise<string> {
  const account = await prisma.account.findFirst();
  if (account?.driveFolderId) return account.driveFolderId;

  const drive = google.drive({ version: "v3", auth });
  const found = await drive.files.list({
    q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: {
        name: ROOT_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    id = created.data.id!;
  }
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { driveFolderId: id } });
  }
  return id!;
}

/** Finds (or creates) the Drive folder for a single job. Returns its id. */
export async function ensureJobFolder(job: {
  id: string;
  reference: string;
  title: string;
  driveFolderId?: string | null;
}): Promise<string | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  if (job.driveFolderId) return job.driveFolderId;

  const drive = google.drive({ version: "v3", auth });
  const root = await ensureRootFolder(auth);
  const name = `${job.reference} — ${job.title}`.slice(0, 120);

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [root],
    },
    fields: "id",
  });
  const folderId = created.data.id!;
  await prisma.job.update({ where: { id: job.id }, data: { driveFolderId: folderId } });
  return folderId;
}

export type UploadedFile = {
  fileId: string;
  name: string;
  webViewLink: string;
  mimeType: string;
};

const PHOTOS_FOLDER_NAME = "Photos (client)";

/**
 * Makes a Drive file/folder viewable by anyone with the link. Idempotent.
 * Returns true if the file is (now) publicly viewable, false if sharing failed —
 * e.g. a Google Workspace policy that forbids anyone-with-link sharing, in which
 * case the caller should warn the owner that clients won't be able to open it.
 */
async function shareAnyoneWithLink(drive: any, fileId: string): Promise<boolean> {
  const perms = await drive.permissions
    .list({ fileId, fields: "permissions(id,type)" })
    .catch(() => null);
  if (perms?.data.permissions?.some((p: any) => p.type === "anyone")) return true;
  const created = await drive.permissions
    .create({ fileId, requestBody: { role: "reader", type: "anyone" } })
    .catch(() => null);
  return Boolean(created);
}

/**
 * Feature: client photo sharing. Ensures a "Photos (client)" subfolder exists
 * inside a job's Drive folder and is viewable by anyone with the link, so the
 * link can be sent to the client without exposing the job's private PDFs/plans.
 * Returns the folder id + shareable link, or null in demo mode.
 */
export async function ensureJobPhotosFolder(job: {
  id: string;
  reference: string;
  title: string;
  driveFolderId?: string | null;
  drivePhotosFolderId?: string | null;
}): Promise<{ folderId: string; link: string; shared: boolean } | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  const drive = google.drive({ version: "v3", auth });

  let photosId = job.drivePhotosFolderId || null;
  if (!photosId) {
    const parent = await ensureJobFolder(job);
    if (!parent) return null;
    // Reuse an existing Photos subfolder if one is already there.
    const found = await drive.files
      .list({
        q: `name='${PHOTOS_FOLDER_NAME}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
      })
      .catch(() => null);
    photosId = found?.data.files?.[0]?.id || null;
    if (!photosId) {
      const created = await drive.files.create({
        requestBody: {
          name: PHOTOS_FOLDER_NAME,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parent],
        },
        fields: "id",
      });
      photosId = created.data.id!;
    }
    await prisma.job.update({ where: { id: job.id }, data: { drivePhotosFolderId: photosId } });
  }

  const shared = await shareAnyoneWithLink(drive, photosId);
  return { folderId: photosId, link: `https://drive.google.com/drive/folders/${photosId}`, shared };
}

/** Uploads image buffers into a job's shared "Photos (client)" folder. */
export async function uploadPhotosToJobFolder(
  job: {
    id: string;
    reference: string;
    title: string;
    driveFolderId?: string | null;
    drivePhotosFolderId?: string | null;
  },
  files: { name: string; data: Buffer; mimeType: string }[]
): Promise<{ uploaded: UploadedFile[]; folderLink: string; shared: boolean } | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  const ph = await ensureJobPhotosFolder(job);
  if (!ph) return null;

  const drive = google.drive({ version: "v3", auth });
  const uploaded: UploadedFile[] = [];
  for (const f of files) {
    // Dedupe by name: if a photo with this name already exists in the folder,
    // reuse it instead of creating a duplicate. This makes retries idempotent —
    // e.g. when a chunk reached the server but the response was lost on patchy
    // signal and the client re-queued the same photo.
    const escaped = escapeDriveQuery(f.name);
    const found = await drive.files
      .list({
        q: `name='${escaped}' and '${ph.folderId}' in parents and trashed=false`,
        fields: "files(id, name, webViewLink, mimeType)",
        spaces: "drive",
      })
      .catch(() => null);
    const existing = found?.data.files?.[0];
    if (existing?.id) {
      uploaded.push({
        fileId: existing.id,
        name: existing.name || f.name,
        webViewLink: existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`,
        mimeType: existing.mimeType || f.mimeType,
      });
      continue;
    }
    const created = await drive.files.create({
      requestBody: { name: f.name, parents: [ph.folderId] },
      media: { mimeType: f.mimeType, body: Readable.from(f.data) },
      fields: "id, name, webViewLink, mimeType",
    });
    uploaded.push({
      fileId: created.data.id!,
      name: created.data.name || f.name,
      webViewLink: created.data.webViewLink || `https://drive.google.com/file/d/${created.data.id}/view`,
      mimeType: created.data.mimeType || f.mimeType,
    });
  }
  return { uploaded, folderLink: ph.link, shared: ph.shared };
}

/** Uploads a buffer into a job's Drive folder and returns shareable metadata. */
export async function uploadToJobFolder(
  job: { id: string; reference: string; title: string; driveFolderId?: string | null },
  name: string,
  data: Buffer,
  mimeType = "application/pdf"
): Promise<UploadedFile | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;

  const folderId = await ensureJobFolder(job);
  const drive = google.drive({ version: "v3", auth });

  // Dedupe: if a file with this name already exists in the job's folder, update
  // it in place instead of adding another copy. This stops the folder filling up
  // with duplicates when plans are re-attached or a report is regenerated.
  if (folderId) {
    const escaped = escapeDriveQuery(name);
    const found = await drive.files
      .list({
        q: `name='${escaped}' and '${folderId}' in parents and trashed=false`,
        fields: "files(id, name, webViewLink, mimeType)",
        spaces: "drive",
      })
      .catch(() => null);
    const existing = found?.data.files?.[0];
    if (existing?.id) {
      const updated = await drive.files.update({
        fileId: existing.id,
        media: { mimeType, body: Readable.from(data) },
        fields: "id, name, webViewLink, mimeType",
      });
      return {
        fileId: updated.data.id || existing.id,
        name: updated.data.name || existing.name || name,
        webViewLink:
          updated.data.webViewLink || existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`,
        mimeType: updated.data.mimeType || mimeType,
      };
    }
  }

  const created = await drive.files.create({
    requestBody: { name, parents: folderId ? [folderId] : undefined },
    media: { mimeType, body: Readable.from(data) },
    fields: "id, name, webViewLink, mimeType",
  });

  // Files stay private to the connected Google account. The webViewLink on the
  // calendar event opens for the owner (who is signed in) without making
  // confidential client drawings / POs / addresses public to anyone with the link.

  return {
    fileId: created.data.id!,
    name: created.data.name || name,
    webViewLink:
      created.data.webViewLink || `https://drive.google.com/file/d/${created.data.id}/view`,
    mimeType: created.data.mimeType || mimeType,
  };
}

/**
 * One-time cleanup: in every job's Drive folder, keep only the newest file of
 * each name and move the older duplicates to the trash. Returns how many folders
 * were scanned and files trashed. No-op in demo mode.
 */
export async function dedupeJobFolders(): Promise<{ scanned: number; removed: number }> {
  const auth = await getAuthorizedClient();
  if (!auth) return { scanned: 0, removed: 0 };
  const drive = google.drive({ version: "v3", auth });

  const jobs = await prisma.job.findMany({
    where: { driveFolderId: { not: null } },
    select: { driveFolderId: true },
  });
  const folders = [...new Set(jobs.map((j) => j.driveFolderId).filter(Boolean) as string[])];

  let scanned = 0;
  let removed = 0;
  for (const folderId of folders) {
    scanned++;
    const res = await drive.files
      .list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, modifiedTime)",
        spaces: "drive",
        pageSize: 1000,
      })
      .catch(() => null);
    const files = res?.data.files || [];
    const byName = new Map<string, { id: string; modifiedTime?: string }[]>();
    for (const f of files) {
      const arr = byName.get(f.name || "") || [];
      arr.push({ id: f.id!, modifiedTime: f.modifiedTime || undefined });
      byName.set(f.name || "", arr);
    }
    for (const [, arr] of byName) {
      if (arr.length <= 1) continue;
      arr.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || "")); // newest first
      for (const dup of arr.slice(1)) {
        const ok = await drive.files.update({ fileId: dup.id, requestBody: { trashed: true } }).catch(() => null);
        if (ok) removed++;
      }
    }
  }
  return { scanned, removed };
}

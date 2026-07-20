import { google } from "googleapis";
import { getAuthorizedClient } from "./oauth";
import { prisma } from "@/lib/db";

const wrap76 = (s: string): string => s.replace(/(.{76})/g, "$1\r\n");
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Builds a raw RFC 2822 message: a text/plain + text/html alternative, with an
 * optional inline logo (multipart/related, shown via cid:logo) and an optional
 * PDF attachment (multipart/mixed). */
function buildRawMessage(opts: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  attachment?: { filename: string; data: Buffer; mimeType?: string };
  logo?: { data: Buffer; mime: string };
}): string {
  const { to, from, subject, text, html, attachment, logo } = opts;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  // text + html alternative.
  const ALT = "jf_alt_b";
  const altEntity =
    `Content-Type: multipart/alternative; boundary="${ALT}"\r\n\r\n` +
    `--${ALT}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${text}\r\n\r\n` +
    `--${ALT}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n\r\n` +
    `--${ALT}--`;

  // Wrap with multipart/related when there's an inline logo.
  let contentEntity = altEntity;
  if (logo) {
    const REL = "jf_rel_b";
    contentEntity =
      `Content-Type: multipart/related; boundary="${REL}"\r\n\r\n` +
      `--${REL}\r\n${altEntity}\r\n\r\n` +
      `--${REL}\r\n` +
      `Content-Type: ${logo.mime}\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-ID: <logo>\r\n` +
      `Content-Disposition: inline; filename="logo"\r\n\r\n${wrap76(logo.data.toString("base64"))}\r\n\r\n` +
      `--${REL}--`;
  }

  // Wrap with multipart/mixed when there's a PDF attachment.
  let rootEntity = contentEntity;
  if (attachment) {
    const MIX = "jf_mix_b";
    rootEntity =
      `Content-Type: multipart/mixed; boundary="${MIX}"\r\n\r\n` +
      `--${MIX}\r\n${contentEntity}\r\n\r\n` +
      `--${MIX}\r\n` +
      `Content-Type: ${attachment.mimeType || "application/pdf"}; name="${attachment.filename}"\r\n` +
      `Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n${wrap76(attachment.data.toString("base64"))}\r\n\r\n` +
      `--${MIX}--`;
  }

  const mime = `From: ${from}\r\nTo: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\n${rootEntity}`;

  return Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sends an email as the connected Google account. Renders an HTML version of
 * the body and embeds the account logo (if set) in the signature. Returns true
 * if sent. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; data: Buffer; mimeType?: string };
}): Promise<boolean> {
  const auth = await getAuthorizedClient();
  if (!auth) return false;

  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const from = profile.data.emailAddress || "me";

  const account = await prisma.account.findFirst();
  const logo = account?.logo
    ? { data: Buffer.from(account.logo, "base64"), mime: account.logoMime || "image/png" }
    : undefined;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1917;white-space:pre-wrap">${escapeHtml(opts.body)}</div>` +
    (logo ? `<div style="margin-top:16px"><img src="cid:logo" alt="logo" style="max-height:90px;max-width:280px"></div>` : "");

  const raw = buildRawMessage({ to: opts.to, from, subject: opts.subject, text: opts.body, html, attachment: opts.attachment, logo });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return true;
}

export type FoundAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
};

/**
 * Searches the mailbox for PDF attachments relevant to a job (by reference,
 * client email, or title) and downloads them. Returns [] in demo mode.
 */
export async function findJobPdfAttachments(query: {
  reference: string;
  clientEmail?: string | null;
  title: string;
  maxMessages?: number;
}): Promise<FoundAttachment[]> {
  const auth = await getAuthorizedClient();
  if (!auth) return [];

  const gmail = google.gmail({ version: "v1", auth });
  // Match on the job title or the client's address — NOT on `query.reference`,
  // which is an app-generated id (e.g. JOB-1042) that never appears in the
  // client's own email, so it can only ever match nothing.
  const terms: string[] = ['filename:pdf', 'has:attachment'];
  const orTerms = [`"${query.title}"`];
  if (query.clientEmail) orTerms.push(`from:${query.clientEmail}`);
  const q = `${terms.join(" ")} (${orTerms.join(" OR ")})`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: query.maxMessages || 10,
  });

  const results: FoundAttachment[] = [];
  for (const msg of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
    const parts = flattenParts(full.data.payload);
    for (const part of parts) {
      if (
        part.filename &&
        part.filename.toLowerCase().endsWith(".pdf") &&
        part.body?.attachmentId
      ) {
        const att = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: msg.id!,
          id: part.body.attachmentId,
        });
        const dataB64 = att.data.data || "";
        results.push({
          messageId: msg.id!,
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || "application/pdf",
          data: Buffer.from(dataB64, "base64"),
        });
      }
    }
  }
  return results;
}

/** Re-downloads the image attachments from a single Gmail message by id. */
export async function getMessageImages(messageId: string): Promise<FoundAttachment[]> {
  const auth = await getAuthorizedClient();
  if (!auth) return [];
  const gmail = google.gmail({ version: "v1", auth });
  const full = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const out: FoundAttachment[] = [];
  for (const part of flattenParts(full.data.payload)) {
    const name = (part.filename || "").toLowerCase();
    if (part.filename && /\.(png|jpe?g|gif|webp)$/.test(name) && part.body?.attachmentId) {
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: part.body.attachmentId,
      });
      out.push({
        messageId,
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "image/png",
        data: Buffer.from(att.data.data || "", "base64"),
      });
    }
  }
  return out;
}

export type LeadMessage = {
  messageId: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body: string;
  attachments: FoundAttachment[];
};

function header(payload: any, name: string): string {
  const h = (payload?.headers || []).find(
    (x: any) => x.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function parseFrom(value: string): { name: string; email: string } {
  // "Emily <emily@x.com>" or "emily@x.com"
  const m = value.match(/^(.*?)<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/"/g, "").trim(), email: m[2].trim().toLowerCase() };
  return { name: value.trim(), email: value.trim().toLowerCase() };
}

function decodeBody(payload: any): string {
  const parts = flattenParts(payload);
  // Prefer text/plain; fall back to stripped HTML.
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  const chosen = plain || html;
  if (!chosen?.body?.data) return "";
  const text = Buffer.from(chosen.body.data, "base64").toString("utf-8");
  return chosen === html ? text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : text.trim();
}

/**
 * Searches Gmail for recent messages from the given sender addresses and
 * returns them parsed (with any PDF attachments downloaded). [] in demo mode.
 */
export async function findLeadMessages(
  senders: string[],
  opts: { sinceDays?: number; maxMessages?: number } = {}
): Promise<LeadMessage[]> {
  const auth = await getAuthorizedClient();
  if (!auth || senders.length === 0) return [];

  const gmail = google.gmail({ version: "v1", auth });
  const fromQuery = senders.map((s) => `from:${s}`).join(" OR ");
  const q = `(${fromQuery}) newer_than:${opts.sinceDays || 30}d`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: opts.maxMessages || 25,
  });

  const out: LeadMessage[] = [];
  for (const msg of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
    const payload = full.data.payload;
    const from = parseFrom(header(payload, "From"));
    const subject = header(payload, "Subject") || "(no subject)";

    const attachments: FoundAttachment[] = [];
    for (const part of flattenParts(payload)) {
      const name = (part.filename || "").toLowerCase();
      const isJobFile = /\.(pdf|png|jpe?g|gif|webp)$/.test(name);
      if (part.filename && isJobFile && part.body?.attachmentId) {
        const att = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: msg.id!,
          id: part.body.attachmentId,
        });
        attachments.push({
          messageId: msg.id!,
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || "application/pdf",
          data: Buffer.from(att.data.data || "", "base64"),
        });
      }
    }

    out.push({
      messageId: msg.id!,
      threadId: full.data.threadId || msg.id!,
      fromName: from.name || from.email,
      fromEmail: from.email,
      subject,
      snippet: full.data.snippet || "",
      body: decodeBody(payload),
      attachments,
    });
  }
  return out;
}

function flattenParts(payload: any): any[] {
  if (!payload) return [];
  const out: any[] = [];
  const walk = (p: any) => {
    if (!p) return;
    out.push(p);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

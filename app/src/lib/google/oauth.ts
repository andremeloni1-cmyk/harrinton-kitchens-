import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  // drive.file: access only the folders/files this app creates — not the
  // user's entire Drive. Sufficient because we only ever create and read our
  // own job folders. (Existing connections must reconnect to pick up the change.)
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(): string {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function newOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

export function authUrl(state?: string): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh token
    scope: GOOGLE_SCOPES,
    ...(state ? { state } : {}),
  });
}

/**
 * Returns an authorised OAuth2 client for the owner account, transparently
 * refreshing and persisting the access token. Returns null when Google is not
 * configured or the owner hasn't connected yet — callers then fall back to
 * "demo mode" (everything works locally, nothing is pushed to Google).
 */
export async function getAuthorizedClient(): Promise<OAuth2Client | null> {
  if (!googleConfigured()) return null;

  const account = await prisma.account.findFirst({
    where: { googleRefreshToken: { not: null } },
  });
  if (!account?.googleRefreshToken) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: account.googleAccessToken || undefined,
    refresh_token: account.googleRefreshToken,
    expiry_date: account.googleTokenExpiry?.getTime(),
  });

  // Persist refreshed tokens back to the DB.
  client.on("tokens", async (tokens) => {
    try {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          googleAccessToken: tokens.access_token ?? account.googleAccessToken,
          googleTokenExpiry: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : account.googleTokenExpiry,
          ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
        },
      });
    } catch {
      /* best-effort token persistence */
    }
  });

  return client;
}

export async function isGoogleConnected(): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { googleRefreshToken: { not: null } },
  });
  return Boolean(account?.googleRefreshToken);
}

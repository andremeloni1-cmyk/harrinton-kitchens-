import { NextResponse } from "next/server";
import { google } from "googleapis";
import { newOAuthClient } from "@/lib/google/oauth";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = process.env.APP_URL || "http://localhost:3000";
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", base));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/settings?error=no_code", base));

  // CSRF guard: the state we set at /api/auth/google must round-trip.
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("google_oauth_state="))
    ?.split("=")[1];
  if (!cookieState || cookieState !== searchParams.get("state")) {
    return NextResponse.redirect(new URL("/settings?error=state_mismatch", base));
  }

  try {
    const client = newOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Look up the connected Google account's email.
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email || undefined;

    const ownerEmail = process.env.OWNER_EMAIL || googleEmail || "owner@example.com";
    const account =
      (await prisma.companySettings.findFirst()) ??
      (await prisma.companySettings.create({ data: { email: ownerEmail } }));

    await prisma.companySettings.update({
      where: { id: account.id },
      data: {
        googleAccessToken: tokens.access_token || null,
        googleRefreshToken: tokens.refresh_token || account.googleRefreshToken || null,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleEmail,
        name: account.name || me.data.name || "Workshop Owner",
      },
    });

    return NextResponse.redirect(new URL("/settings?connected=1", base));
  } catch (e) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", base));
  }
}

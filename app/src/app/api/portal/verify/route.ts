import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPortalToken, setPortalCookie } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// Consume a magic link: validate the token, set the portal session cookie, and
// redirect into the portal. The cookie (not the link) is what keeps the client
// signed in, so the short-lived link stays low-risk.
export async function GET(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token") || "";

  const row = token
    ? await prisma.clientPortalToken.findFirst({
        where: { tokenHash: hashPortalToken(token), expiresAt: { gt: new Date() } },
      })
    : null;

  if (!row) return NextResponse.redirect(new URL("/portal?error=link", base));

  await prisma.clientPortalToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  await setPortalCookie(row.clientId);
  return NextResponse.redirect(new URL("/portal", base));
}

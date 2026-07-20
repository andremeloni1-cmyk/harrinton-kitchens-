import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/session";
import { exchangeCode, listConnections } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

/** Best-effort email from the id_token. The token came straight from Xero's
 * token endpoint over TLS, so decoding without signature verification is fine. */
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString());
    return payload.email || undefined;
  } catch {
    return undefined;
  }
}

export async function GET(req: Request) {
  const base = process.env.APP_URL || "http://localhost:3000";
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", base));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code) return NextResponse.redirect(new URL("/settings?error=xero_no_code", base));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("xero_oauth_state")?.value;
  if (!expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?error=xero_bad_state", base));
  }

  try {
    const tokens = await exchangeCode(code);
    const connections = await listConnections(tokens.accessToken);
    const org =
      connections.find((c) => c.tenantType === "ORGANISATION") ?? connections[0];
    if (!org) return NextResponse.redirect(new URL("/settings?error=xero_no_org", base));

    const ownerEmail =
      process.env.OWNER_EMAIL || emailFromIdToken(tokens.idToken) || "owner@example.com";
    const account =
      (await prisma.companySettings.findFirst()) ??
      (await prisma.companySettings.create({ data: { email: ownerEmail } }));

    await prisma.companySettings.update({
      where: { id: account.id },
      data: {
        xeroAccessToken: tokens.accessToken,
        xeroRefreshToken: tokens.refreshToken,
        xeroTokenExpiry: tokens.expiresAt,
        xeroTenantId: org.tenantId,
        xeroOrgName: org.tenantName || null,
      },
    });

    const res = NextResponse.redirect(new URL("/settings?xero_connected=1", base));
    res.cookies.delete("xero_oauth_state");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/settings?error=xero_oauth_failed", base));
  }
}

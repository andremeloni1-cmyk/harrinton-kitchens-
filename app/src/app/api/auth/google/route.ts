import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authUrl, googleConfigured } from "@/lib/google/oauth";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.APP_URL || "http://localhost:3000";
  // Connecting an integration is an ADMIN action (manage_settings). Redirect
  // anyone without it back to /login rather than starting the OAuth flow.
  const user = await getSessionUser();
  if (!user || !can(user, "manage_settings")) return NextResponse.redirect(new URL("/login", base));
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=google_not_configured", base));
  }

  // CSRF guard: the callback checks this state round-trips via cookie.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return res;
}

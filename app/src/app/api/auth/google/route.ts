import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authUrl, googleConfigured } from "@/lib/google/oauth";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.APP_URL || "http://localhost:3000";
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", base));
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

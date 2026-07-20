import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { isGoogleConnected, googleConfigured } from "@/lib/google/oauth";
import { isXeroConnected, xeroConfigured } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const account = await prisma.account.findFirst();
  const templates = await prisma.emailTemplate.findMany({ orderBy: { key: "asc" } });
  return json({
    account: account
      ? {
          name: account.name,
          email: account.email,
          googleEmail: account.googleEmail,
          calendarId: account.calendarId,
          signature: account.signature,
          logo: account.logo,
          logoMime: account.logoMime,
          logoDark: account.logoDark,
          logoDarkMime: account.logoDarkMime,
        }
      : null,
    templates,
    google: {
      configured: googleConfigured(),
      connected: await isGoogleConnected(),
    },
    xero: {
      configured: xeroConfigured(),
      connected: await isXeroConnected(),
      orgName: account?.xeroOrgName ?? null,
      bankAccountId: account?.xeroBankAccountId ?? null,
      bankAccountName: account?.xeroBankAccountName ?? null,
      expenseAccountCode: account?.xeroExpenseAccountCode ?? null,
    },
    ai: {
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}

export async function PATCH(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  // Only allow raster image logos — reject SVG/other so a stored logo can never
  // carry active content served to the public login page.
  const RASTER = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const safeMime = (m: unknown, fallback: string | null): string | null => {
    if (typeof m !== "string") return fallback;
    return RASTER.has(m) ? m : "image/png";
  };
  if (body.account && ("logo" in body.account || "logoDark" in body.account)) {
    if ("logoMime" in body.account) body.account.logoMime = safeMime(body.account.logoMime, null);
    if ("logoDarkMime" in body.account) body.account.logoDarkMime = safeMime(body.account.logoDarkMime, null);
  }

  if (body.account) {
    const account = await prisma.account.findFirst();
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          name: body.account.name ?? account.name,
          calendarId: body.account.calendarId ?? account.calendarId,
          signature: "signature" in body.account ? body.account.signature || null : account.signature,
          logo: "logo" in body.account ? body.account.logo || null : account.logo,
          logoMime: "logoMime" in body.account ? body.account.logoMime || null : account.logoMime,
          logoDark: "logoDark" in body.account ? body.account.logoDark || null : account.logoDark,
          logoDarkMime:
            "logoDarkMime" in body.account ? body.account.logoDarkMime || null : account.logoDarkMime,
          // Which Xero bank account receipts post against + the expense code.
          xeroBankAccountId:
            "xeroBankAccountId" in body.account ? body.account.xeroBankAccountId || null : account.xeroBankAccountId,
          xeroBankAccountName:
            "xeroBankAccountName" in body.account
              ? body.account.xeroBankAccountName || null
              : account.xeroBankAccountName,
          xeroExpenseAccountCode:
            "xeroExpenseAccountCode" in body.account
              ? String(body.account.xeroExpenseAccountCode || "").trim() || null
              : account.xeroExpenseAccountCode,
        },
      });
    }
  }

  if (Array.isArray(body.templates)) {
    for (const t of body.templates) {
      if (!t.key) continue;
      await prisma.emailTemplate.update({
        where: { key: t.key },
        data: {
          subject: t.subject,
          body: t.body,
          enabled: t.enabled ?? true,
        },
      });
    }
  }

  return json({ ok: true });
}

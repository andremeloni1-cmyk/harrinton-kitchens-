import { prisma } from "@/lib/db";

// Xero OAuth2 (authorization code). Access tokens last 30 minutes; refresh
// tokens are single-use rotating with a 60-day idle expiry, so every refresh
// must persist the newly issued refresh token before the response is used.

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

// Xero moved to granular scopes on 2 March 2026: apps created after that date
// reject the old broad scopes (accounting.transactions / accounting.reports.read)
// with invalid_scope at the authorize endpoint. Request only the granular
// scopes this app actually uses. Overridable via XERO_SCOPES (space-separated)
// without a code change if Xero shuffles names again.
const DEFAULT_XERO_SCOPES = [
  "offline_access", // refresh token
  "openid",
  "profile",
  "email",
  "accounting.invoices", // create/read/update ACCREC invoices
  "accounting.contacts", // find/create contacts
  "accounting.banktransactions", // spend-money receipts
  "accounting.attachments", // attach the receipt image to the spend-money txn
  "accounting.settings.read", // list the org's bank accounts (GET /Accounts)
  "accounting.reports.profitandloss.read", // the P&L page
];

export const XERO_SCOPES = process.env.XERO_SCOPES
  ? process.env.XERO_SCOPES.split(/[\s,]+/).filter(Boolean)
  : DEFAULT_XERO_SCOPES;

export type XeroTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  idToken?: string;
};

export type XeroConnection = {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
};

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function redirectUri(): string {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/xero/callback`;
}

export function authUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    scope: XERO_SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

function basicAuth(): string {
  const raw = `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams): Promise<XeroTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuth(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Xero token request failed (${res.status}): ${text.slice(0, 300)}`);
    (err as Error & { invalidGrant?: boolean }).invalidGrant = text.includes("invalid_grant");
    throw err;
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    idToken: data.id_token,
  };
}

export async function exchangeCode(code: string): Promise<XeroTokens> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    })
  );
}

/** Lists the Xero organisations the token is connected to. */
export async function listConnections(accessToken: string): Promise<XeroConnection[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Xero /connections failed (${res.status})`);
  return (await res.json()) as XeroConnection[];
}

async function clearXeroConnection(accountId: string): Promise<void> {
  await prisma.companySettings.update({
    where: { id: accountId },
    data: {
      xeroAccessToken: null,
      xeroRefreshToken: null,
      xeroTokenExpiry: null,
      xeroTenantId: null,
      xeroOrgName: null,
    },
  });
}

// Single-flight refresh: concurrent API routes share one in-flight refresh so
// a single-use rotating refresh token is never consumed twice at once.
let refreshing: Promise<{ accessToken: string; tenantId: string } | null> | null = null;

async function refreshTokens(account: {
  id: string;
  xeroRefreshToken: string;
  xeroTenantId: string;
}): Promise<{ accessToken: string; tenantId: string } | null> {
  try {
    const tokens = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.xeroRefreshToken,
      })
    );
    // Persist the rotated refresh token before handing the access token out.
    await prisma.companySettings.update({
      where: { id: account.id },
      data: {
        xeroAccessToken: tokens.accessToken,
        xeroRefreshToken: tokens.refreshToken,
        xeroTokenExpiry: tokens.expiresAt,
      },
    });
    return { accessToken: tokens.accessToken, tenantId: account.xeroTenantId };
  } catch (e) {
    if ((e as Error & { invalidGrant?: boolean }).invalidGrant) {
      // Refresh token expired (60 days idle) or was revoked — force reconnect.
      await clearXeroConnection(account.id);
      await prisma.activity.create({
        data: {
          type: "xero",
          message: "Xero connection expired — reconnect in Settings",
          meta: "{}",
        },
      });
      return null;
    }
    throw e;
  }
}

/**
 * Returns an access token + tenant id for Xero API calls, transparently
 * refreshing (and persisting the rotated refresh token) when the current
 * token is about to expire. Returns null when Xero is not configured or the
 * owner hasn't connected — callers then fall back to local-only behaviour.
 */
export async function getXeroContext(
  opts: { forceRefresh?: boolean } = {}
): Promise<{ accessToken: string; tenantId: string } | null> {
  if (!xeroConfigured()) return null;

  const account = await prisma.companySettings.findFirst({
    where: { xeroRefreshToken: { not: null } },
  });
  if (!account?.xeroRefreshToken || !account.xeroTenantId) return null;

  const fresh =
    !opts.forceRefresh &&
    account.xeroAccessToken &&
    account.xeroTokenExpiry &&
    account.xeroTokenExpiry.getTime() > Date.now() + 60_000;
  if (fresh) {
    return { accessToken: account.xeroAccessToken!, tenantId: account.xeroTenantId };
  }

  if (!refreshing) {
    refreshing = refreshTokens({
      id: account.id,
      xeroRefreshToken: account.xeroRefreshToken,
      xeroTenantId: account.xeroTenantId,
    }).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function isXeroConnected(): Promise<boolean> {
  const account = await prisma.companySettings.findFirst({
    where: { xeroRefreshToken: { not: null } },
  });
  return Boolean(account?.xeroRefreshToken);
}

export async function disconnectXero(): Promise<void> {
  const account = await prisma.companySettings.findFirst({
    where: { xeroRefreshToken: { not: null } },
  });
  if (!account) return;

  // Best-effort: remove the app's connection to the organisation in Xero too.
  try {
    const ctx = await getXeroContext();
    if (ctx) {
      const connections = await listConnections(ctx.accessToken);
      const conn = connections.find((c) => c.tenantId === ctx.tenantId);
      if (conn) {
        await fetch(`${CONNECTIONS_URL}/${conn.id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${ctx.accessToken}` },
        });
      }
    }
  } catch {
    /* disconnect locally regardless */
  }

  await clearXeroConnection(account.id);
}

import { getXeroContext } from "@/lib/xero/oauth";

const BASE = "https://api.xero.com/api.xro/2.0";

/** A Xero API error with any validation messages Xero returned. */
export class XeroApiError extends Error {
  status: number;
  validationErrors: string[];

  constructor(status: number, message: string, validationErrors: string[] = []) {
    super(message);
    this.name = "XeroApiError";
    this.status = status;
    this.validationErrors = validationErrors;
  }
}

function extractValidationErrors(body: unknown): string[] {
  const errors: string[] = [];
  const root = body as {
    Message?: string;
    Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
  } | null;
  for (const el of root?.Elements ?? []) {
    for (const ve of el.ValidationErrors ?? []) {
      if (ve.Message) errors.push(ve.Message);
    }
  }
  if (errors.length === 0 && root?.Message) errors.push(root.Message);
  return errors;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authenticated fetch against the Xero accounting API. Returns null when Xero
 * is not connected (local-only mode, mirroring the Google libs). Retries once
 * on 429 (honouring Retry-After, capped at 5s) and once on 401 after forcing
 * a token refresh. Other failures throw XeroApiError.
 */
export async function xeroFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  let ctx = await getXeroContext();
  if (!ctx) return null;

  let retried429 = false;
  let retried401 = false;

  for (;;) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${ctx.accessToken}`,
        "xero-tenant-id": ctx.tenantId,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });

    if (res.ok) return (await res.json()) as T;

    if (res.status === 429 && !retried429) {
      retried429 = true;
      const after = Number(res.headers.get("retry-after") || 1);
      await sleep(Math.min(after, 5) * 1000);
      continue;
    }
    if (res.status === 401 && !retried401) {
      retried401 = true;
      ctx = await getXeroContext({ forceRefresh: true });
      if (!ctx) return null;
      continue;
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const validation = extractValidationErrors(body);
    throw new XeroApiError(
      res.status,
      validation[0] || `Xero API error (${res.status}) on ${path.split("?")[0]}`,
      validation
    );
  }
}

export const xeroGet = <T>(path: string) => xeroFetch<T>(path);
export const xeroPost = <T>(path: string, body: unknown) =>
  xeroFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

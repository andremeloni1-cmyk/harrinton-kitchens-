// Next.js instrumentation: capture server-side request errors so they aren't
// silently lost (P2-C4). Logs a structured line — surfaced in the pm2 logs that
// pm2-logrotate now rotates — and, when ERROR_WEBHOOK_URL is set, forwards a
// compact alert. The webhook is provider-agnostic (a Sentry/Slack/other
// endpoint), so monitoring can be turned on later without a code change.

type ErrRequest = { path?: string; method?: string };
type ErrContext = { routerKind?: string; routePath?: string; routeType?: string };

export async function onRequestError(error: unknown, request: ErrRequest, context: ErrContext) {
  const detail = {
    at: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    method: request?.method,
    path: request?.path,
    routerKind: context?.routerKind,
    routePath: context?.routePath,
    routeType: context?.routeType,
  };
  // eslint-disable-next-line no-console -- deliberate: this IS the error sink.
  console.error("[request-error]", JSON.stringify(detail));

  const url = process.env.ERROR_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(detail),
      });
    } catch {
      // Error reporting must never throw.
    }
  }
}

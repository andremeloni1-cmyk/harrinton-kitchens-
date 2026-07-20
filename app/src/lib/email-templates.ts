import { prisma } from "@/lib/db";

export type TemplateVars = Record<string, string>;

function fmtDate(d?: Date | null): string {
  if (!d) return "TBC";
  return new Date(d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtTime(d?: Date | null): string {
  if (!d) return "TBC";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function jobTemplateVars(job: {
  title: string;
  reference: string;
  address?: string | null;
  clientName?: string | null;
  scheduledStart?: Date | null;
}, ownerName: string): TemplateVars {
  return {
    jobTitle: job.title,
    reference: job.reference,
    address: job.address || "TBC",
    clientName: job.clientName || "there",
    startDate: fmtDate(job.scheduledStart),
    startTime: fmtTime(job.scheduledStart),
    ownerName,
  };
}

export function render(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Loads a template by key and renders subject + body with the given vars. */
export async function renderTemplate(
  key: string,
  vars: TemplateVars
): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  const t = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!t) return null;
  return {
    subject: render(t.subject, vars),
    body: render(t.body, vars),
    enabled: t.enabled,
  };
}

/**
 * Resolves the email for a specific job: starts from the global template, applies
 * any per-company (lead-source) override, then appends the account signature.
 */
export async function resolveTemplate(
  job: { leadSource?: string | null; companyId?: string | null; clientName?: string | null },
  key: string,
  vars: TemplateVars
): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  const global = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!global) return null;
  let subject = global.subject;
  let body = global.body;

  // Resolve the billing company for this job: prefer the explicit companyId,
  // else match the job's sender domain against a lead source.
  let src = job.companyId
    ? await prisma.leadSource.findUnique({ where: { id: job.companyId } })
    : null;
  if (!src && job.leadSource) {
    const ls = job.leadSource.toLowerCase();
    const sources = await prisma.leadSource.findMany();
    src = sources.find((s) => ls.includes(s.email.toLowerCase())) ?? null;
  }

  // Per-company wording override.
  if (src?.templates) {
    try {
      const ov = (JSON.parse(src.templates) || {})[key];
      if (ov?.subject) subject = ov.subject;
      if (ov?.body) body = ov.body;
    } catch {
      /* ignore malformed overrides */
    }
  }

  // Templates greet the company (e.g. "Hi mii Kitchens,"). Fall back to the
  // person on the job, then a generic greeting — never leave {{companyName}}.
  const companyName = src ? (src.displayName || src.name).trim() : "";
  const vars2: TemplateVars = {
    ...vars,
    companyName: companyName || vars.clientName || job.clientName || "there",
  };

  let outBody = render(body, vars2);
  const account = await prisma.companySettings.findFirst();
  const sig = account?.signature?.trim();
  if (sig) outBody += `\n\n${render(sig, vars2)}`;

  return { subject: render(subject, vars2), body: outBody, enabled: global.enabled };
}

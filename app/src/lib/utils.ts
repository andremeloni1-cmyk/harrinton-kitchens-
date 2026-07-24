import crypto from "node:crypto";
import { Prisma, type Job } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Constant-time string comparison (for secrets like the cron header). */
export function timingSafeEqualStr(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Generates the next human-friendly job reference, e.g. JOB-1042.
 * Uses the highest existing number (not the most recent row) so it stays
 * collision-free even when references are created out of timestamp order. */
export async function nextReference(): Promise<string> {
  const all = await prisma.job.findMany({ select: { reference: true } });
  let max = 1000;
  for (const j of all) {
    const m = j.reference?.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `JOB-${max + 1}`;
}

/**
 * Creates a job with a fresh reference, retrying on a unique-constraint clash.
 * nextReference() reads-then-writes, so two concurrent creates (e.g. the cron
 * scan and a manual "New job") can pick the same JOB-N; the loser's create
 * throws Prisma P2002. Retrying with a recomputed reference resolves it.
 */
export async function createJobWithReference(
  build: (reference: string) => Prisma.JobCreateInput
): Promise<Job> {
  for (let attempt = 0; ; attempt++) {
    const reference = await nextReference();
    try {
      return await prisma.job.create({ data: build(reference) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
}

export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/** The lower-cased domain part of an email address. A value that is already a
 * bare domain (no `@`) is returned unchanged. Lets a LeadSource be configured
 * as either `acme.com` or `greg@acme.com` and still match a sender's domain. */
export function emailDomain(addr: string): string {
  const a = addr.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  return at >= 0 ? a.slice(at + 1) : a;
}

export function json<T>(data: T, init?: number | ResponseInit): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers: {
      "content-type": "application/json",
      // API responses can carry client/invoice data — never let a browser or
      // proxy cache them at rest.
      "cache-control": "no-store",
      ...(responseInit as ResponseInit)?.headers,
    },
  });
}

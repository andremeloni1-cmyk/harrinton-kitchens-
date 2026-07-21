import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Liveness + readiness probe for deploys/smoke tests (P13.2). Confirms the app
// is up and the database is reachable. Never exposes secrets or private data.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ ok: true, app: BRAND.name, db: "up" });
  } catch {
    return json({ ok: false, app: BRAND.name, db: "down" }, 503);
  }
}

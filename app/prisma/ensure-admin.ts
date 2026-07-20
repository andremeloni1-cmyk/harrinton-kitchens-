import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Deploy-time safety net for per-user auth. Migrations create an empty User
// table, but the deploy pipeline does NOT run the demo seed — so an in-place
// update of a live instance could leave it with no way to sign in. This ensures
// at least one active ADMIN exists, bootstrapping the owner from OWNER_EMAIL /
// OWNER_PASSWORD when needed. It is idempotent (a no-op once an admin exists),
// never overwrites an existing password, and never touches other data. Wired
// into deploy/update.sh and deploy/auto-update.sh after `prisma migrate deploy`.
//
// Best-effort: it always exits 0 so a bootstrap hiccup can't block a deploy.

const prisma = new PrismaClient();

async function run() {
  const activeAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (activeAdmin) {
    console.log(`ensure-admin: active ADMIN already present (${activeAdmin.email}) — nothing to do.`);
    return;
  }

  const email = (process.env.OWNER_EMAIL || "").toLowerCase().trim();
  if (!email) {
    console.warn(
      "ensure-admin: no active ADMIN and OWNER_EMAIL is unset — cannot bootstrap a login. " +
        "Set OWNER_EMAIL (and OWNER_PASSWORD) and re-run `npm run ensure-admin`."
    );
    return;
  }
  const password = process.env.OWNER_PASSWORD || "benchline-demo";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        active: true,
        // Only set a password if they don't already have one — never clobber.
        ...(existing.passwordHash ? {} : { passwordHash: hashPassword(password) }),
      },
    });
    console.log(`ensure-admin: promoted ${email} to active ADMIN.`);
  } else {
    await prisma.user.create({
      data: { email, name: "Owner", role: "ADMIN", active: true, passwordHash: hashPassword(password) },
    });
    console.log(`ensure-admin: created ADMIN ${email}.`);
  }
}

run()
  .catch((e) => {
    // Non-fatal: log loudly but don't fail the deploy (migrations already ran).
    console.error("ensure-admin: failed (non-fatal) —", e);
  })
  .finally(() => prisma.$disconnect());

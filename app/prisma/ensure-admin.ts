import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { resolveBootstrapPassword } from "../src/lib/bootstrap-password";

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
  const existing = await prisma.user.findUnique({ where: { email } });

  // Mint a password only when one is actually needed (a brand-new admin, or an
  // existing record with none). Never fall back to a static default: use
  // OWNER_PASSWORD; refuse in production when it's unset; otherwise generate and
  // print a one-time password. A re-run that finds a password never clobbers it.
  const needsPassword = !existing || !existing.passwordHash;
  let passwordHash: string | undefined;
  if (needsPassword) {
    const resolved = resolveBootstrapPassword();
    if (resolved.kind === "refuse") {
      console.error(
        "ensure-admin: no active ADMIN and OWNER_PASSWORD is unset in production — " +
          "refusing to bootstrap an admin with a default password. Set OWNER_PASSWORD " +
          "(or use the invite/reset flow) and re-run `npm run ensure-admin`."
      );
      process.exit(1);
    }
    if (resolved.kind === "generated") {
      console.log(
        `ensure-admin: OWNER_PASSWORD unset — generated a one-time admin password:\n\n    ${resolved.password}\n\n` +
          "Sign in and change it, or set OWNER_PASSWORD to choose your own."
      );
    }
    passwordHash = hashPassword(resolved.password);
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", active: true, ...(passwordHash ? { passwordHash } : {}) },
    });
    console.log(`ensure-admin: promoted ${email} to active ADMIN.`);
  } else {
    await prisma.user.create({
      data: { email, name: "Owner", role: "ADMIN", active: true, passwordHash },
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

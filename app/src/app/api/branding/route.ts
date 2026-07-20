import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Lightweight branding for in-app header / login: business name + logo. Public
// so the login screen can show the business identity before sign-in (a name and
// logo aren't sensitive in this single-owner app).
export async function GET() {
  const account = await prisma.account.findFirst();
  return json({
    name: account?.name || null,
    logo: account?.logo || null,
    logoMime: account?.logoMime || null,
    logoDark: account?.logoDark || null,
    logoDarkMime: account?.logoDarkMime || null,
  });
}

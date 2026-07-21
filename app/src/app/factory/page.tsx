import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { FactoryBoard } from "@/components/FactoryBoard";
import { FactoryTablet } from "@/components/FactoryTablet";

export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const user = await getSessionUser();
  if (!can(user, "factory_board")) redirect("/");
  // Factory-floor staff land on the single-station tablet view; office and
  // admins get the full board.
  return user?.role === "FACTORY" ? <FactoryTablet /> : <FactoryBoard />;
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { FactoryBoard } from "@/components/FactoryBoard";

export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const user = await getSessionUser();
  if (!can(user, "factory_board")) redirect("/");
  return <FactoryBoard />;
}

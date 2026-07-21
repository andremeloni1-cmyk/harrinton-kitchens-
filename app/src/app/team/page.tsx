import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { TeamManager } from "@/components/TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!can(user, "manage_users")) redirect("/");
  return <TeamManager meId={user!.id} />;
}

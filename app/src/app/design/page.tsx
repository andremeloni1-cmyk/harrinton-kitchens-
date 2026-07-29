import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { DesignTabs } from "@/components/DesignTabs";

export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const user = await getSessionUser();
  if (!can(user, "manage_jobs")) redirect("/");
  return <DesignTabs />;
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SetupWizard } from "@/components/SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await getSessionUser();
  if (!can(user, "manage_settings")) redirect("/");
  return <SetupWizard />;
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { DesignQueue } from "@/components/DesignQueue";

export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const user = await getSessionUser();
  if (!can(user, "manage_jobs")) redirect("/");
  return <DesignQueue />;
}

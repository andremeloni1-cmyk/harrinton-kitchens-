import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { LoadSheet } from "@/components/LoadSheet";

export const dynamic = "force-dynamic";

export default async function LoadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, "deliver")) redirect("/");
  const { id } = await params;
  return <LoadSheet loadId={id} canManage={can(user, "manage_loads")} />;
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { DeliveryList } from "@/components/DeliveryList";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const user = await getSessionUser();
  if (!can(user, "deliver")) redirect("/");
  return <DeliveryList canManage={can(user, "manage_loads")} />;
}

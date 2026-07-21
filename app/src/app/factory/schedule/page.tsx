import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ScheduleBoard } from "@/components/ScheduleBoard";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await getSessionUser();
  if (!can(user, "factory_board")) redirect("/");
  return <ScheduleBoard />;
}

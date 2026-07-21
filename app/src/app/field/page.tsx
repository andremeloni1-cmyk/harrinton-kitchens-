import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { FieldRunSheet } from "@/components/FieldRunSheet";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const user = await getSessionUser();
  if (!can(user, "field_app")) redirect("/");
  return <FieldRunSheet />;
}

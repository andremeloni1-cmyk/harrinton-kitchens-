import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SurfacePlaceholder } from "@/components/SurfacePlaceholder";

export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const user = await getSessionUser();
  if (!can(user, "factory_board")) redirect("/");
  return (
    <SurfacePlaceholder
      title="Factory"
      tagline="The production floor."
      message="The station board — job cards, part-level tracking and QR scanning — lands in Phase 7. Until then, the hardware store is under More."
    />
  );
}

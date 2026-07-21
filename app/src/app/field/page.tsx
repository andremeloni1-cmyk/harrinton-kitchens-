import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SurfacePlaceholder } from "@/components/SurfacePlaceholder";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const user = await getSessionUser();
  if (!can(user, "field_app")) redirect("/");
  return (
    <SurfacePlaceholder
      title="Field"
      tagline="Your day on site."
      message="The installer run sheet — today's jobs, addresses, drawings and snags — lands in Phase 10. Until then, the installer portal is under More."
    />
  );
}

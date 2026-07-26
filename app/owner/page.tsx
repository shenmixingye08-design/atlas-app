import { ExecutiveDashboard } from "@/components/owner/executive/executive-dashboard";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="dashboard">
      <ExecutiveDashboard snapshot={snapshot} />
    </OwnerShell>
  );
}

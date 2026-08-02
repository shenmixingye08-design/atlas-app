import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { ProductionReadinessPanel } from "@/components/owner/production-readiness-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getProductionOpsDashboard } from "@/lib/production/dashboard";

export const dynamic = "force-dynamic";

export default async function OwnerProductionPage() {
  await requireAtlasOwner();
  const snapshot = await getProductionOpsDashboard();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="production" />
        <ProductionReadinessPanel initialData={snapshot} />
      </div>
    </OwnerShell>
  );
}

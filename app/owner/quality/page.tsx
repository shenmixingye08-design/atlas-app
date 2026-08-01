import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { QualityDashboardPanel } from "@/components/owner/quality-dashboard-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerQualityPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="quality" />
        <QualityDashboardPanel />
      </div>
    </OwnerShell>
  );
}

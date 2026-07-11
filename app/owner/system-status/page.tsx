import { MaintenanceModePanel } from "@/components/owner/maintenance-mode-panel";
import { MonitoringDashboardPanel } from "@/components/owner/monitoring-dashboard-panel";
import { SystemStatusPanel } from "@/components/owner/system-status-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerSystemStatusPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="systemStatus" />
        <MonitoringDashboardPanel />
        <MaintenanceModePanel />
        <SystemStatusPanel />
      </div>
    </OwnerShell>
  );
}

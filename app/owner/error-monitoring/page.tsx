import { ErrorMonitoringPanel } from "@/components/owner/error-monitoring-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerErrorMonitoringPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="errorMonitoring" />
        <ErrorMonitoringPanel />
      </div>
    </OwnerShell>
  );
}

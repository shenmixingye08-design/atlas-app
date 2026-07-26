import { ErrorMonitoringPanel } from "@/components/owner/error-monitoring-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerErrorMonitoringPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="errorMonitoring">
      <div className="space-y-8">
        <ErrorMonitoringPanel />
      </div>
    </OwnerShell>
  );
}

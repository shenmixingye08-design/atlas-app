import { DisasterRecoveryPanel } from "@/components/owner/disaster-recovery-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerDisasterRecoveryPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="disasterRecovery">
      <div className="space-y-8">
        <DisasterRecoveryPanel />
      </div>
    </OwnerShell>
  );
}

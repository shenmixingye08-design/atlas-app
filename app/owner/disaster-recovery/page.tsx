import { DisasterRecoveryPanel } from "@/components/owner/disaster-recovery-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerDisasterRecoveryPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="disasterRecovery" />
        <DisasterRecoveryPanel />
      </div>
    </OwnerShell>
  );
}

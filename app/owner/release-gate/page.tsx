import { ReleaseGatePanel } from "@/components/owner/release-gate-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerReleaseGatePage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="releaseGate" />
        <ReleaseGatePanel />
      </div>
    </OwnerShell>
  );
}

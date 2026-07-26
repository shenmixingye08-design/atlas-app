import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { ReliabilitySrePanel } from "@/components/owner/reliability-sre-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerReliabilityPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="reliability" />
        <ReliabilitySrePanel />
      </div>
    </OwnerShell>
  );
}

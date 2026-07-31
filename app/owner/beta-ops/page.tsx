import { BetaOpsPanel } from "@/components/owner/beta-ops-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerBetaOpsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="betaOps" />
        <BetaOpsPanel />
      </div>
    </OwnerShell>
  );
}

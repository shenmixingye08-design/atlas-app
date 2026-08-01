import { BetaUxPanel } from "@/components/owner/beta-ux-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerBetaUxPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="betaUx" />
        <BetaUxPanel />
      </div>
    </OwnerShell>
  );
}

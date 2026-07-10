import { BetaUsersPanel } from "@/components/owner/beta-users-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerBetaUsersPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="betaUsers" />
        <BetaUsersPanel />
      </div>
    </OwnerShell>
  );
}

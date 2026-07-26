import { BetaUsersPanel } from "@/components/owner/beta-users-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerBetaUsersPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="betaUsers">
      <div className="space-y-8">
        <BetaUsersPanel />
      </div>
    </OwnerShell>
  );
}

import { AccountDeletionsPanel } from "@/components/owner/account-deletions-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAccountDeletionsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="accountDeletions" />
        <AccountDeletionsPanel />
      </div>
    </OwnerShell>
  );
}

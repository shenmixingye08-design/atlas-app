import { AccountDeletionsPanel } from "@/components/owner/account-deletions-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAccountDeletionsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="accountDeletions">
      <div className="space-y-8">
        <AccountDeletionsPanel />
      </div>
    </OwnerShell>
  );
}

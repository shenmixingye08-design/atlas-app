import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerUsersPanel } from "@/components/owner/owner-users-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { listOwnerManagedUsers } from "@/lib/owner/user-admin";

export const dynamic = "force-dynamic";

export default async function OwnerUsersPage() {
  await requireAtlasOwner();
  const users = await listOwnerManagedUsers();

  return (
    <OwnerShell active="users">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">ユーザー管理</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            契約・利用・停止/再開。管理者は ATLAS_OWNER_EMAILS で追加できます。
          </p>
        </header>
        <OwnerUsersPanel users={users} />
      </div>
    </OwnerShell>
  );
}

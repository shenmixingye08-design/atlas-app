import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { MemoryApplyDashboard } from "@/components/owner/memory-apply-dashboard";

export default async function OwnerMemoryApplyPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="memoryApply" />
        <MemoryApplyDashboard />
      </div>
    </OwnerShell>
  );
}

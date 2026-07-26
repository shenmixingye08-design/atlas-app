import { ApiUsagePanel } from "@/components/owner/api-usage-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerApiUsagePage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="apiUsage">
      <div className="space-y-8">
        <ApiUsagePanel />
      </div>
    </OwnerShell>
  );
}

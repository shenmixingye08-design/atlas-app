import { FeatureFlagsPanel } from "@/components/owner/feature-flags-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerFeatureFlagsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="featureFlags" />
        <FeatureFlagsPanel />
      </div>
    </OwnerShell>
  );
}

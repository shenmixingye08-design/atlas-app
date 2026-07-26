import { FeatureFlagsPanel } from "@/components/owner/feature-flags-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerFeatureFlagsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="featureFlags">
      <div className="space-y-8">
        <FeatureFlagsPanel />
      </div>
    </OwnerShell>
  );
}

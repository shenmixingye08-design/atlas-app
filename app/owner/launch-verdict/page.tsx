import { LaunchVerdictPanel } from "@/components/owner/launch-verdict-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerLaunchVerdictPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="launchVerdict" />
        <LaunchVerdictPanel />
      </div>
    </OwnerShell>
  );
}

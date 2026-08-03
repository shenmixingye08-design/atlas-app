import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { WorkQueuePanel } from "@/components/owner/work-queue-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerSchedulerPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="scheduler" />
        <WorkQueuePanel />
      </div>
    </OwnerShell>
  );
}

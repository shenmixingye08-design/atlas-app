import { AcquisitionPanel } from "@/components/owner/acquisition-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwnerOrNotFound } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

export default async function OwnerAcquisitionPage() {
  await requireAtlasOwnerOrNotFound();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="revenueAgent" />
        <AcquisitionPanel />
      </div>
    </OwnerShell>
  );
}

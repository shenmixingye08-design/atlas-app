import { ExternalServicesPanel } from "@/components/owner/external-services-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerExternalServicesPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="externalServices" />
        <ExternalServicesPanel />
      </div>
    </OwnerShell>
  );
}

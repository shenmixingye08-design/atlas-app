import { ExternalServicesPanel } from "@/components/owner/external-services-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerExternalServicesPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="externalServices">
      <div className="space-y-8">
        <ExternalServicesPanel />
      </div>
    </OwnerShell>
  );
}
